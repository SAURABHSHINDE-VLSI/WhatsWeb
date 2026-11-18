import { FastifyInstance } from 'fastify';
import sodium from 'libsodium-wrappers';
import { z } from 'zod';
import { prisma } from './db.js';
import { TokenPayload, authenticate } from './auth.js';
import { checkRateLimit } from './rateLimit.js';

const uploadBundleSchema = z.object({
  identityKey: z.string().min(40).max(60), // Base64 32-byte X25519 key
  identitySignKey: z.string().min(40).max(60), // Base64 32-byte Ed25519 key
  signedPreKey: z.string().min(40).max(60), // Base64 32-byte X25519 key
  signedPreKeySignature: z.string().min(80).max(100), // Base64 64-byte Ed25519 signature
  oneTimePreKeys: z
    .array(
      z.object({
        keyId: z.number().int(),
        publicKey: z.string().min(40).max(60),
      })
    )
    .max(100),
  isReRegistration: z.boolean().optional(),
});

export async function keyRoutes(app: FastifyInstance) {
  await sodium.ready;

  // Upload public pre-key bundle
  app.post('/api/keys/bundle', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const parse = uploadBundleSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid key bundle', details: parse.error.format() });
    }

    const {
      identityKey,
      identitySignKey,
      signedPreKey,
      signedPreKeySignature,
      oneTimePreKeys,
      isReRegistration,
    } = parse.data;

    // Cryptographically verify signed pre-key signature using Ed25519 identity signing key
    try {
      const sigBytes = sodium.from_base64(signedPreKeySignature);
      const spkBytes = sodium.from_base64(signedPreKey);
      const signKeyBytes = sodium.from_base64(identitySignKey);

      const isValidSignature = sodium.crypto_sign_verify_detached(sigBytes, spkBytes, signKeyBytes);
      if (!isValidSignature) {
        return reply.status(400).send({
          error: 'Signed pre-key signature verification failed. Bundle rejected.',
        });
      }
    } catch (err) {
      return reply.status(400).send({ error: 'Malformed cryptographic keys in pre-key bundle' });
    }

    // Check existing bundle
    const existing = await prisma.preKeyBundle.findUnique({
      where: { userId: currentUserId },
    });

    if (existing) {
      // Prevent silent identity key replacement unless explicitly re-registering
      if (
        (existing.identityKey !== identityKey || existing.identitySignKey !== identitySignKey) &&
        !isReRegistration
      ) {
        return reply.status(403).send({
          error:
            'Identity key cannot be replaced without explicit re-registration confirmation. Contacts must be notified of key changes.',
        });
      }
    }

    // Atomic upsert in transaction
    const result = await prisma.$transaction(async (tx) => {
      const bundle = await tx.preKeyBundle.upsert({
        where: { userId: currentUserId },
        create: {
          userId: currentUserId,
          identityKey,
          identitySignKey,
          signedPreKey,
          signedPreKeySignature,
        },
        update: {
          identityKey,
          identitySignKey,
          signedPreKey,
          signedPreKeySignature,
        },
      });

      // Cap stored OPKs: max 100 unused OPKs
      const existingOpkCount = await tx.oneTimePreKey.count({
        where: { bundleId: bundle.id, consumed: false },
      });

      const allowedToAdd = Math.max(0, 100 - existingOpkCount);
      const keysToAdd = oneTimePreKeys.slice(0, allowedToAdd);

      if (keysToAdd.length > 0) {
        await tx.oneTimePreKey.createMany({
          data: keysToAdd.map((k) => ({
            bundleId: bundle.id,
            keyId: k.keyId,
            publicKey: k.publicKey,
            consumed: false,
          })),
        });
      }

      const totalUnusedOpks = existingOpkCount + keysToAdd.length;
      return { bundle, totalUnusedOpks };
    });

    return reply.status(201).send({
      success: true,
      message: 'Key bundle published and verified successfully',
      unusedOpkCount: result.totalUnusedOpks,
    });
  });

  // Fetch pre-key bundle for a contact to initiate X3DH session
  app.get('/api/keys/bundle/:userId', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;
    const { userId: targetUserId } = req.params as { userId: string };

    // Rate limit bundle fetches: 30 fetches per minute per requester
    const rate = checkRateLimit('bundle-fetch', currentUserId, 30, 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({ error: 'Too many key bundle requests. Please wait a moment.' });
    }

    // Blocking check: If either user has blocked the other, refuse key bundle fetch!
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });

    if (block) {
      return reply.status(404).send({ error: 'Pre-key bundle not found for user' });
    }

    // Atomic fetch and OPK consumption in a transaction
    const bundleData = await prisma.$transaction(async (tx) => {
      const bundle = await tx.preKeyBundle.findUnique({
        where: { userId: targetUserId },
      });

      if (!bundle) return null;

      // Find one unconsumed OPK and atomically mark it consumed
      const opk = await tx.oneTimePreKey.findFirst({
        where: { bundleId: bundle.id, consumed: false },
        orderBy: { createdAt: 'asc' },
      });

      let consumedOpk: { keyId: number; publicKey: string } | null = null;
      if (opk) {
        await tx.oneTimePreKey.update({
          where: { id: opk.id },
          data: { consumed: true },
        });
        consumedOpk = {
          keyId: opk.keyId,
          publicKey: opk.publicKey,
        };
      }

      // Check remaining OPK count
      const remainingOpks = await tx.oneTimePreKey.count({
        where: { bundleId: bundle.id, consumed: false },
      });

      return {
        bundle,
        consumedOpk,
        remainingOpks,
      };
    });

    if (!bundleData) {
      return reply.status(404).send({ error: 'Pre-key bundle not found for user' });
    }

    return reply.send({
      userId: bundleData.bundle.userId,
      identityKey: bundleData.bundle.identityKey,
      identitySignKey: bundleData.bundle.identitySignKey,
      signedPreKey: bundleData.bundle.signedPreKey,
      signedPreKeySignature: bundleData.bundle.signedPreKeySignature,
      oneTimePreKey: bundleData.consumedOpk,
      lowOpkWarning: bundleData.remainingOpks < 5,
    });
  });
}
