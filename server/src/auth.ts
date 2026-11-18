import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db.js';

const registerSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6),
  displayName: z.string().min(1).max(50),
  phoneNumber: z.string().optional(),
  avatarTint: z.number().int().min(0).max(3).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export interface TokenPayload {
  userId: string;
  username: string;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized: invalid or expired token' });
  }
}

export async function authRoutes(app: FastifyInstance) {
  // Seed demo users on startup if empty
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const demoPasswordHash = await argon2.hash('password123');
    await prisma.user.createMany({
      data: [
        {
          id: 'user_alex',
          username: 'alex',
          displayName: 'Alex Mercer',
          phoneNumber: '+1 (555) 019-2834',
          passwordHash: demoPasswordHash,
          avatarTint: 0,
        },
        {
          id: 'user_maya',
          username: 'maya',
          displayName: 'Maya Lin',
          phoneNumber: '+1 (555) 014-9921',
          passwordHash: demoPasswordHash,
          avatarTint: 1,
        },
        {
          id: 'user_julian',
          username: 'julian',
          displayName: 'Julian Vance',
          phoneNumber: '+1 (555) 018-7733',
          passwordHash: demoPasswordHash,
          avatarTint: 2,
        },
        {
          id: 'user_amara',
          username: 'amara',
          displayName: 'Amara Rao',
          phoneNumber: '+1 (555) 012-3456',
          passwordHash: demoPasswordHash,
          avatarTint: 3,
        },
      ],
    });
    console.log('[Auth] Seeded 4 default users (password: password123)');
  }

  // Register
  app.post('/api/auth/register', async (req, reply) => {
    const parse = registerSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parse.error.format() });
    }

    const { username, password, displayName, phoneNumber, avatarTint = 0 } = parse.data;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase() },
          ...(phoneNumber ? [{ phoneNumber }] : []),
        ],
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Username or phone number is already registered' });
    }

    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        passwordHash,
        displayName,
        phoneNumber,
        avatarTint,
      },
    });

    const accessToken = app.jwt.sign(
      { userId: user.id, username: user.username },
      { expiresIn: '15m' }
    );

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    reply.setCookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: false, // allow local dev
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        avatarTint: user.avatarTint,
      },
      accessToken,
    });
  });

  // Login
  app.post('/api/auth/login', async (req, reply) => {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid input' });
    }

    const { username, password } = parse.data;
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase() },
          { phoneNumber: username },
        ],
      },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const accessToken = app.jwt.sign(
      { userId: user.id, username: user.username },
      { expiresIn: '15m' }
    );

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    reply.setCookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        avatarTint: user.avatarTint,
      },
      accessToken,
    });
  });

  // Refresh token
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

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    const accessToken = app.jwt.sign(
      { userId: session.user.id, username: session.user.username },
      { expiresIn: '15m' }
    );

    return reply.send({
      accessToken,
      user: {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        phoneNumber: session.user.phoneNumber,
        avatarTint: session.user.avatarTint,
      },
    });
  });

  // Me
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        phoneNumber: true,
        avatarTint: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });

  // Logout
  app.post('/api/auth/logout', async (req, reply) => {
    const rawRefreshToken = req.cookies.refreshToken;
    if (rawRefreshToken) {
      const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await prisma.session.deleteMany({ where: { refreshTokenHash } }).catch(() => {});
    }

    reply.clearCookie('refreshToken', { path: '/api/auth' });
    return reply.send({ success: true });
  });
}
