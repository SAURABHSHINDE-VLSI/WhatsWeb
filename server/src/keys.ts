import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from './db.js';
import { TokenPayload, authenticate } from './auth.js';

const uploadBundleSchema = z.object({
  identityKey: z.string().min(1),
  signedPreKey: z.string().min(1),
  signedPreKeySignature: z.string().min(1),
  oneTimePreKeys: z.array(
    z.object({
      keyId: z.number().int(),
      publicKey: z.string().min(1),
    })
  ).min(1),
});

export async function keyRoutes(app: FastifyInstance) {
  // Upload public pre-key bundle
  app.post('/api/keys/bundle', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const parse = uploadBundleSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid key bundle', details: parse.error.format() });
    }

    const { identityKey, signedPreKey, signedPreKeySignature, oneTimePreKeys } = parse.data;

    // Upsert PreKeyBundle
    const bundle = await prisma.preKeyBundle.upsert({
      where: { userId: currentUserId },
      create: {
        userId: currentUserId,
        identityKey,
        signedPreKey,
        signedPreKeySignature,
      },
      update: {
        identityKey,
        signedPreKey,
        signedPreKeySignature,
      },
    });

    // Add new one-time prekeys
    await prisma.oneTimePreKey.createMany({
      data: oneTimePreKeys.map((k) => ({
        bundleId: bundle.id,
        keyId: k.keyId,
        publicKey: k.publicKey,
        consumed: false,
      })),
    });

    return reply.status(201).send({
      success: true,
      message: 'Key bundle published successfully',
      opkCount: oneTimePreKeys.length,
    });
  });

  // Fetch pre-key bundle for a contact to initiate X3DH session
  app.get('/api/keys/bundle/:userId', { preHandler: [authenticate] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };

    const bundle = await prisma.preKeyBundle.findUnique({
      where: { userId },
      include: {
        oneTimePreKeys: {
          where: { consumed: false },
          take: 1,
        },
      },
    });

    if (!bundle) {
      return reply.status(404).send({ error: 'Pre-key bundle not found for user' });
    }

    let consumedOpk: { keyId: number; publicKey: string } | null = null;

    if (bundle.oneTimePreKeys.length > 0) {
      const opk = bundle.oneTimePreKeys[0];
      await prisma.oneTimePreKey.update({
        where: { id: opk.id },
        data: { consumed: true },
      });
      consumedOpk = {
        keyId: opk.keyId,
        publicKey: opk.publicKey,
      };
    }

    return reply.send({
      userId: bundle.userId,
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      signedPreKeySignature: bundle.signedPreKeySignature,
      oneTimePreKey: consumedOpk,
    });
  });
}
