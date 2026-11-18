import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from './db.js';
import { checkRateLimit } from './rateLimit.js';

export interface TokenPayload {
  userId: string;
  username: string | null;
  sessionId: string;
}

const isProduction = process.env.NODE_ENV === 'production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'whatsus',
  'whatsweb',
  'official',
  'root',
  'security',
  'moderator',
  'system',
  'api',
  'bot',
  'everyone',
  'null',
  'undefined',
  'contact',
  'contacts',
  'chat',
  'chats',
  'settings',
  'profile',
  'auth',
  'login',
  'logout',
  'register',
  'invite',
  'invites',
  'request',
  'requests',
  'blocked',
  'report',
  'media',
  'ws',
]);

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function validateUsernameFormat(raw: string): { valid: boolean; error?: string; clean?: string } {
  const clean = raw.trim().toLowerCase();
  if (!USERNAME_REGEX.test(clean)) {
    return {
      valid: false,
      error: 'Username must be 3-20 characters long and contain only lowercase letters, numbers, and underscores.',
    };
  }
  if (clean.startsWith('_') || clean.endsWith('_')) {
    return {
      valid: false,
      error: 'Username cannot begin or end with an underscore.',
    };
  }
  if (RESERVED_USERNAMES.has(clean)) {
    return {
      valid: false,
      error: 'This username is reserved and cannot be claimed.',
    };
  }
  return { valid: true, clean };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized: invalid or expired access token' });
  }
}

export function serializeSafeUser(user: {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  avatarTint?: number;
  privacyAllowMessages?: string;
  createdAt?: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    avatarTint: user.avatarTint ?? 0,
    privacyAllowMessages: user.privacyAllowMessages ?? 'anyone',
    isOnboarded: Boolean(user.username),
    createdAt: user.createdAt,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // 1. Issue a single-use cryptographic nonce bound to the sign-in attempt
  app.get('/api/auth/nonce', async (req, reply) => {
    const ip = req.ip || '127.0.0.1';
    const rate = checkRateLimit('auth-nonce', ip, 30, 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({ error: 'Too many requests. Please wait a moment.' });
    }

    const nonce = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    await prisma.authNonce.create({
      data: {
        nonce,
        expiresAt,
      },
    });

    return reply.send({ nonce, expiresAt: expiresAt.toISOString() });
  });

  // 2. Google Sign-In with ID Token verification
  app.post('/api/auth/google', async (req, reply) => {
    const ip = req.ip || '127.0.0.1';
    const rate = checkRateLimit('auth-login', ip, 15, 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({ error: 'Too many login attempts. Please wait a minute.' });
    }

    const schema = z.object({
      idToken: z.string().min(1),
      nonce: z.string().min(1),
      deviceName: z.string().max(100).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Google sign-in payload', details: parsed.error.format() });
    }

    const { idToken, nonce, deviceName } = parsed.data;

    // Verify nonce in DB
    const nonceRecord = await prisma.authNonce.findUnique({
      where: { nonce },
    });

    if (!nonceRecord || nonceRecord.used || nonceRecord.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired sign-in nonce. Please try again.' });
    }

    // Mark nonce as used immediately to prevent replay
    await prisma.authNonce.update({
      where: { id: nonceRecord.id },
      data: { used: true },
    });

    // Verify Google ID token using google-auth-library
    if (!GOOGLE_CLIENT_ID) {
      return reply.status(500).send({ error: 'Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID)' });
    }

    let ticket;
    try {
      ticket = await oauth2Client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (err: any) {
      app.log.warn({ err }, 'Google ID token verification failed');
      return reply.status(401).send({ error: 'Google token verification failed' });
    }

    const payload = ticket.getPayload();
    if (!payload) {
      return reply.status(401).send({ error: 'Invalid Google token payload' });
    }

    // Verify claims: sub, aud, iss, email_verified, nonce
    if (!payload.sub) {
      return reply.status(401).send({ error: 'Missing subject claim in Google token' });
    }
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return reply.status(401).send({ error: 'Token audience does not match configured Google Client ID' });
    }
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
      return reply.status(401).send({ error: 'Invalid token issuer' });
    }
    if (!payload.email_verified) {
      return reply.status(403).send({ error: 'Unverified Google email accounts are not permitted' });
    }
    if (payload.nonce && payload.nonce !== nonce) {
      return reply.status(401).send({ error: 'Nonce mismatch in Google ID token' });
    }

    const googleSub = payload.sub;
    const googleEmail = payload.email || null;
    const googleName = payload.name || 'New User';
    const googlePicture = payload.picture || null;

    // Find or create identity linked to user
    let identity = await prisma.identity.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'google',
          providerUserId: googleSub,
        },
      },
      include: { user: true },
    });

    let user = identity?.user;

    if (!user) {
      // New user registration
      user = await prisma.user.create({
        data: {
          email: googleEmail, // stored privately for recovery/display only
          displayName: googleName,
          avatarUrl: googlePicture,
          identities: {
            create: {
              provider: 'google',
              providerUserId: googleSub,
            },
          },
        },
      });
    } else if (googleEmail && user.email !== googleEmail) {
      // Keep recovery email up to date privately
      await prisma.user.update({
        where: { id: user.id },
        data: { email: googleEmail },
      });
    }

    // Create session with familyId for rotating refresh token with reuse detection
    const familyId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const session = await prisma.session.create({
      data: {
        familyId,
        userId: user.id,
        refreshTokenHash,
        deviceName: deviceName || req.headers['user-agent']?.slice(0, 100) || 'Web Browser',
        ipAddress: ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Short-lived access token kept in memory only (15 minutes)
    const accessToken = app.jwt.sign(
      { userId: user.id, username: user.username, sessionId: session.id },
      { expiresIn: '15m' }
    );

    // Set rotating refresh token in httpOnly cookie
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

  // 3. Onboarding: Choose unique @username and displayName
  app.post('/api/auth/onboarding', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const schema = z.object({
      username: z.string().min(3).max(20),
      displayName: z.string().min(1).max(50),
      avatarTint: z.number().int().min(0).max(5).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid onboarding payload', details: parsed.error.format() });
    }

    const { username: rawUsername, displayName, avatarTint = 0 } = parsed.data;

    const validation = validateUsernameFormat(rawUsername);
    if (!validation.valid || !validation.clean) {
      return reply.status(400).send({ error: validation.error });
    }

    const cleanUsername = validation.clean;

    // Check if user is changing an existing username (30-day cooldown enforcement)
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (currentUser.username && currentUser.username !== cleanUsername) {
      if (currentUser.usernameChangedAt) {
        const daysSinceLastChange = (Date.now() - currentUser.usernameChangedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastChange < 30) {
          const daysLeft = Math.ceil(30 - daysSinceLastChange);
          return reply.status(403).send({
            error: `Usernames can only be changed once every 30 days. Please wait ${daysLeft} more day(s).`,
          });
        }
      }
    }

    // Check if username is currently held in cooldown reservation
    const reservation = await prisma.usernameReservation.findUnique({
      where: { username: cleanUsername },
    });
    if (reservation && reservation.heldUntil > new Date()) {
      return reply.status(409).send({ error: 'This username is temporarily reserved and not available.' });
    }

    // Check if another user owns this username
    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        id: { not: currentUserId },
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'This username is already taken. Please choose another.' });
    }

    // If changing username from an old one, put old username into 30-day reservation
    if (currentUser.username && currentUser.username !== cleanUsername) {
      await prisma.usernameReservation.upsert({
        where: { username: currentUser.username },
        create: {
          username: currentUser.username,
          heldUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          heldUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Update user profile
    const updated = await prisma.user.update({
      where: { id: currentUserId },
      data: {
        username: cleanUsername,
        displayName,
        avatarTint,
        usernameChangedAt: new Date(),
      },
    });

    // Issue updated access token containing the new username
    const accessToken = app.jwt.sign(
      { userId: updated.id, username: updated.username, sessionId: payload.sessionId },
      { expiresIn: '15m' }
    );

    return reply.send({
      user: serializeSafeUser(updated),
      accessToken,
    });
  });

  // 4. Rotating refresh token with reuse detection
  app.post('/api/auth/refresh', async (req, reply) => {
    const rawRefreshToken = req.cookies.refreshToken;
    if (!rawRefreshToken) {
      return reply.status(401).send({ error: 'No refresh token provided' });
    }

    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });

    // Reuse detection: If session was revoked or does not exist, check if an old token was reused
    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      if (session?.revokedAt !== null && session?.familyId) {
        // REUSE DETECTED! Revoke entire session family immediately
        app.log.warn({ familyId: session.familyId, userId: session.userId }, 'Token reuse detected! Revoking session family.');
        await prisma.session.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: new Date() },
        });
      }

      reply.clearCookie('refreshToken', {
        path: '/api/auth',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
      });
      return reply.status(401).send({ error: 'Invalid, expired, or reused refresh token' });
    }

    // Rotate refresh token
    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');

    // Revoke old session and issue new session in same family
    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.session.create({
        data: {
          familyId: session.familyId,
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          deviceName: session.deviceName,
          ipAddress: req.ip || session.ipAddress,
          lastUsedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const accessToken = app.jwt.sign(
      { userId: session.user.id, username: session.user.username, sessionId: session.id },
      { expiresIn: '15m' }
    );

    reply.setCookie('refreshToken', newRawRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      accessToken,
      user: serializeSafeUser(session.user),
    });
  });

  // 5. Get current authenticated user profile
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({
      user: {
        ...serializeSafeUser(user),
        email: user.email, // Visible ONLY to account owner
      },
    });
  });

  // 6. List active sessions for account
  app.get('/api/auth/sessions', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const sessions = await prisma.session.findMany({
      where: {
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return reply.send({
      sessions: sessions.map((s) => ({
        ...s,
        isCurrent: s.id === payload.sessionId,
      })),
    });
  });

  // 7. Revoke a specific session
  app.delete('/api/auth/sessions/:sessionId', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const { sessionId } = req.params as { sessionId: string };

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: payload.userId },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    if (sessionId === payload.sessionId) {
      reply.clearCookie('refreshToken', {
        path: '/api/auth',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
      });
    }

    return reply.send({ success: true, message: 'Session revoked' });
  });

  // 8. Log out other devices (revoke all except current)
  app.post('/api/auth/logout-other-sessions', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    await prisma.session.updateMany({
      where: {
        userId: payload.userId,
        id: { not: payload.sessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return reply.send({ success: true, message: 'Logged out of all other devices' });
  });

  // 9. Logout current session
  app.post('/api/auth/logout', async (req, reply) => {
    const rawRefreshToken = req.cookies.refreshToken;
    if (rawRefreshToken) {
      const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await prisma.session.updateMany({
        where: { refreshTokenHash },
        data: { revokedAt: new Date() },
      }).catch(() => {});
    }

    reply.clearCookie('refreshToken', {
      path: '/api/auth',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });

    return reply.send({ success: true });
  });

  // 10. Account Deletion: full GDPR wipe & username 30-day cooldown reservation
  app.delete('/api/auth/account', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const userId = payload.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Reserve username for 30 days before release to prevent impersonation
    if (user.username) {
      await prisma.usernameReservation.upsert({
        where: { username: user.username },
        create: {
          username: user.username,
          heldUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: {
          heldUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Cascading deletion of user records
    await prisma.user.delete({
      where: { id: userId },
    });

    reply.clearCookie('refreshToken', {
      path: '/api/auth',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });

    return reply.send({ success: true, message: 'Account completely deleted.' });
  });
}
