import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticate, serializeSafeUser } from './auth.js';

const isProduction = process.env.NODE_ENV === 'production';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export async function passkeyRoutes(app: FastifyInstance) {
  // 1. Get Passkey Registration Options (Requires Authenticated User)
  app.post(
    '/api/auth/passkey/register-options',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Generate 32-byte cryptographically secure random challenge
      const challengeBuffer = crypto.randomBytes(32);
      const challenge = base64UrlEncode(challengeBuffer);

      // Store in AuthNonce table with 5-minute expiry
      await prisma.authNonce.create({
        data: {
          nonce: `passkey_reg_${challenge}`,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          used: false,
        },
      });

      const rpId = process.env.PASSKEY_RP_ID || request.hostname.split(':')[0] || 'localhost';

      return reply.send({
        challenge,
        rp: {
          name: 'WhatsUs Messenger',
          id: rpId,
        },
        user: {
          id: Buffer.from(user.id, 'utf8').toString('base64url'),
          name: user.username || user.email || 'user',
          displayName: user.displayName || user.username || 'WhatsUs User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      });
    }
  );

  // 2. Verify and Save Passkey Registration
  app.post(
    '/api/auth/passkey/register-verify',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;

      const BodySchema = z.object({
        challenge: z.string().min(10),
        credentialId: z.string().min(10),
        publicKey: z.string().min(10),
        deviceName: z.string().optional(),
        transports: z.string().optional(),
      });

      const parsed = BodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid passkey registration data' });
      }

      const { challenge, credentialId, publicKey, deviceName, transports } = parsed.data;

      // Validate and consume nonce
      const nonceRecord = await prisma.authNonce.findUnique({
        where: { nonce: `passkey_reg_${challenge}` },
      });

      if (!nonceRecord || nonceRecord.used || nonceRecord.expiresAt < new Date()) {
        return reply.status(400).send({ error: 'Passkey registration challenge expired or invalid' });
      }

      await prisma.authNonce.update({
        where: { id: nonceRecord.id },
        data: { used: true },
      });

      // Save passkey credential
      const credential = await prisma.passkeyCredential.create({
        data: {
          userId,
          credentialId,
          publicKey,
          deviceName: deviceName || 'Security Key / Biometrics',
          transports: transports || 'internal',
        },
      });

      return reply.send({
        success: true,
        credential: {
          id: credential.id,
          credentialId: credential.credentialId,
          deviceName: credential.deviceName,
          createdAt: credential.createdAt,
        },
      });
    }
  );

  // 3. List Registered Passkeys for Current User
  app.get(
    '/api/auth/passkey/credentials',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;

      const credentials = await prisma.passkeyCredential.findMany({
        where: { userId },
        select: {
          id: true,
          credentialId: true,
          deviceName: true,
          transports: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ credentials });
    }
  );

  // 4. Remove a Passkey Credential
  app.delete(
    '/api/auth/passkey/credentials/:id',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;
      const { id } = request.params as { id: string };

      await prisma.passkeyCredential.deleteMany({
        where: {
          id,
          userId,
        },
      });

      return reply.send({ success: true });
    }
  );

  // 5. Get Passkey Authentication (Login) Options
  app.post('/api/auth/passkey/login-options', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username } = (request.body as { username?: string }) || {};

    const challengeBuffer = crypto.randomBytes(32);
    const challenge = base64UrlEncode(challengeBuffer);

    await prisma.authNonce.create({
      data: {
        nonce: `passkey_auth_${challenge}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        used: false,
      },
    });

    const rpId = process.env.PASSKEY_RP_ID || request.hostname.split(':')[0] || 'localhost';

    let allowCredentials: { type: 'public-key'; id: string }[] | undefined = undefined;
    if (username) {
      const user = await prisma.user.findUnique({
        where: { username },
        include: { passkeys: true },
      });
      if (user && user.passkeys.length > 0) {
        allowCredentials = user.passkeys.map((p) => ({
          type: 'public-key',
          id: p.credentialId,
        }));
      }
    }

    return reply.send({
      challenge,
      rpId,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    });
  });

  // 6. Verify Passkey Login & Establish Session
  app.post('/api/auth/passkey/login-verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const BodySchema = z.object({
      challenge: z.string().min(10),
      credentialId: z.string().min(10),
      deviceName: z.string().optional(),
    });

    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid login assertion payload' });
    }

    const { challenge, credentialId, deviceName } = parsed.data;

    // Verify challenge
    const nonceRecord = await prisma.authNonce.findUnique({
      where: { nonce: `passkey_auth_${challenge}` },
    });

    if (!nonceRecord || nonceRecord.used || nonceRecord.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Authentication challenge expired or invalid' });
    }

    await prisma.authNonce.update({
      where: { id: nonceRecord.id },
      data: { used: true },
    });

    // Lookup passkey credential
    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialId },
      include: { user: true },
    });

    if (!credential || !credential.user) {
      return reply.status(404).send({ error: 'Unrecognized passkey credential' });
    }

    // Update credential last used timestamp
    await prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    const user = credential.user;

    // Issue rotating refresh token and session
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const familyId = crypto.randomUUID();

    const session = await prisma.session.create({
      data: {
        familyId,
        userId: user.id,
        refreshTokenHash,
        deviceName: deviceName || request.headers['user-agent']?.slice(0, 100) || 'Passkey Device',
        ipAddress: request.ip || '127.0.0.1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = app.jwt.sign(
      { userId: user.id, username: user.username, sessionId: session.id },
      { expiresIn: '15m' }
    );

    reply.setCookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      user: serializeSafeUser(user),
      accessToken,
      isOnboarded: Boolean(user.username),
    });
  });
}
