import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db.js';
import { TokenPayload, authenticate, serializeSafeUser } from './auth.js';
import { checkRateLimit } from './rateLimit.js';

export async function contactRoutes(app: FastifyInstance) {
  // 1. Exact @username lookup (No fuzzy/prefix search to prevent user enumeration)
  const lookupHandler = async (req: any, reply: any) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    // Rate limit lookups: 20 per minute per user/IP
    const rate = checkRateLimit('user-lookup', currentUserId, 20, 60 * 1000);
    if (!rate.allowed) {
      return reply.status(429).send({ error: 'Too many user lookups. Please slow down.' });
    }

    const { username } = req.query as { username?: string };
    if (!username || typeof username !== 'string') {
      return reply.status(400).send({ error: 'Username query parameter is required' });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

    const targetUser = await prisma.user.findFirst({
      where: { username: cleanUsername },
    });

    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check if either user has blocked the other
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUser.id },
          { blockerId: targetUser.id, blockedId: currentUserId },
        ],
      },
    });

    if (block) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check relationship status
    const isContact = Boolean(
      await prisma.contact.findUnique({
        where: { userId_contactId: { userId: currentUserId, contactId: targetUser.id } },
      })
    );

    const pendingRequest = await prisma.contactRequest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUser.id, status: 'pending' },
          { senderId: targetUser.id, receiverId: currentUserId, status: 'pending' },
        ],
      },
    });

    return reply.send({
      user: serializeSafeUser(targetUser),
      isContact,
      hasPendingRequest: Boolean(pendingRequest),
      pendingRequestId: pendingRequest?.id,
    });
  };

  app.get('/api/users/lookup', { preHandler: [authenticate] }, lookupHandler);
  app.get('/api/contacts/lookup', { preHandler: [authenticate] }, lookupHandler);

  // 2. Personal Invite Links: Create, Resolve, Revoke
  app.post('/api/invites', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const schema = z.object({
      expiresInDays: z.number().int().min(1).max(365).optional(),
    });

    const parsed = schema.safeParse(req.body || {});
    const expiresInDays = parsed.success ? parsed.data.expiresInDays : undefined;

    const code = crypto.randomBytes(16).toString('base64url');
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const invite = await prisma.inviteLink.create({
      data: {
        code,
        userId: currentUserId,
        expiresAt,
      },
    });

    return reply.status(201).send({
      code: invite.code,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    });
  });

  // Resolve invite link code (Public or authenticated)
  app.get('/api/invites/:code', async (req, reply) => {
    const { code } = req.params as { code: string };

    const invite = await prisma.inviteLink.findUnique({
      where: { code },
      include: { user: true },
    });

    if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
      return reply.status(404).send({ error: 'Invite link is invalid or has expired' });
    }

    return reply.send({
      user: serializeSafeUser(invite.user),
      code: invite.code,
      expiresAt: invite.expiresAt,
    });
  });

  // Revoke invite link
  app.delete('/api/invites/:code', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const { code } = req.params as { code: string };

    const invite = await prisma.inviteLink.findFirst({
      where: { code, userId: payload.userId },
    });

    if (!invite) {
      return reply.status(404).send({ error: 'Invite link not found' });
    }

    await prisma.inviteLink.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });

    return reply.send({ success: true, message: 'Invite link revoked' });
  });

  // 3. Message Requests
  // List pending incoming message requests
  app.get('/api/contacts/requests', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const requests = await prisma.contactRequest.findMany({
      where: {
        receiverId: payload.userId,
        status: 'pending',
      },
      include: {
        sender: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      requests: requests.map((r) => ({
        id: r.id,
        sender: serializeSafeUser(r.sender),
        createdAt: r.createdAt,
        status: r.status,
      })),
    });
  });

  // Send a contact request
  app.post('/api/contacts/request', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const schema = z.object({
      targetUserId: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'targetUserId is required' });
    }

    const { targetUserId } = parsed.data;

    if (targetUserId === currentUserId) {
      return reply.status(400).send({ error: 'Cannot send contact request to yourself' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check block
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });

    if (block) {
      return reply.status(403).send({ error: 'Cannot connect with this user' });
    }

    // Check target user's privacy setting
    if (targetUser.privacyAllowMessages === 'contacts_only') {
      return reply.status(403).send({
        error: 'This user only accepts messages from established contacts or direct invites.',
      });
    }

    // Create or update request
    const request = await prisma.contactRequest.upsert({
      where: {
        senderId_receiverId: {
          senderId: currentUserId,
          receiverId: targetUserId,
        },
      },
      create: {
        senderId: currentUserId,
        receiverId: targetUserId,
        status: 'pending',
      },
      update: {
        status: 'pending',
        updatedAt: new Date(),
      },
    });

    return reply.status(201).send({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    });
  });

  // Accept a contact request
  app.post('/api/contacts/requests/:id/accept', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const { id } = req.params as { id: string };

    const request = await prisma.contactRequest.findFirst({
      where: { id, receiverId: payload.userId },
    });

    if (!request) {
      return reply.status(404).send({ error: 'Contact request not found' });
    }

    await prisma.$transaction([
      prisma.contactRequest.update({
        where: { id },
        data: { status: 'accepted' },
      }),
      prisma.contact.upsert({
        where: {
          userId_contactId: {
            userId: request.receiverId,
            contactId: request.senderId,
          },
        },
        create: {
          userId: request.receiverId,
          contactId: request.senderId,
        },
        update: {},
      }),
      prisma.contact.upsert({
        where: {
          userId_contactId: {
            userId: request.senderId,
            contactId: request.receiverId,
          },
        },
        create: {
          userId: request.senderId,
          contactId: request.receiverId,
        },
        update: {},
      }),
    ]);

    return reply.send({ success: true, message: 'Contact request accepted' });
  });

  // Ignore / reject a contact request
  app.post('/api/contacts/requests/:id/ignore', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const { id } = req.params as { id: string };

    const request = await prisma.contactRequest.findFirst({
      where: { id, receiverId: payload.userId },
    });

    if (!request) {
      return reply.status(404).send({ error: 'Contact request not found' });
    }

    await prisma.contactRequest.update({
      where: { id },
      data: { status: 'ignored' },
    });

    return reply.send({ success: true, message: 'Contact request ignored' });
  });

  // 4. Block & Report
  app.post('/api/contacts/block', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    const schema = z.object({
      targetUserId: z.string().min(1),
      reason: z.string().max(200).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'targetUserId is required' });
    }

    const { targetUserId, reason } = parsed.data;

    await prisma.$transaction([
      // Add to BlockedUser
      prisma.blockedUser.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: currentUserId,
            blockedId: targetUserId,
          },
        },
        create: {
          blockerId: currentUserId,
          blockedId: targetUserId,
          reason,
        },
        update: { reason },
      }),
      // Remove any mutual contacts
      prisma.contact.deleteMany({
        where: {
          OR: [
            { userId: currentUserId, contactId: targetUserId },
            { userId: targetUserId, contactId: currentUserId },
          ],
        },
      }),
      // Reject any pending requests
      prisma.contactRequest.updateMany({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: currentUserId },
          ],
        },
        data: { status: 'rejected' },
      }),
    ]);

    return reply.send({ success: true, message: 'User blocked successfully' });
  });

  // Unblock user
  app.post('/api/contacts/unblock', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const { targetUserId } = req.body as { targetUserId: string };

    if (!targetUserId) {
      return reply.status(400).send({ error: 'targetUserId is required' });
    }

    await prisma.blockedUser.deleteMany({
      where: {
        blockerId: payload.userId,
        blockedId: targetUserId,
      },
    });

    return reply.send({ success: true, message: 'User unblocked' });
  });

  // List blocked users
  app.get('/api/contacts/blocked', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const blocks = await prisma.blockedUser.findMany({
      where: { blockerId: payload.userId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      blockedUsers: blocks.map((b) => ({
        id: b.blocked.id,
        user: serializeSafeUser(b.blocked),
        blockedAt: b.createdAt,
      })),
    });
  });

  // Report user
  app.post('/api/contacts/report', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const schema = z.object({
      reportedId: z.string().min(1),
      reason: z.string().min(3).max(500),
      blockAlso: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid report payload' });
    }

    const { reportedId, reason, blockAlso } = parsed.data;

    await prisma.userReport.create({
      data: {
        reporterId: payload.userId,
        reportedId,
        reason,
      },
    });

    if (blockAlso) {
      await prisma.blockedUser.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: payload.userId,
            blockedId: reportedId,
          },
        },
        create: {
          blockerId: payload.userId,
          blockedId: reportedId,
          reason,
        },
        update: {},
      });
    }

    return reply.send({ success: true, message: 'Report submitted. Thank you for keeping WhatsUs safe.' });
  });

  // 5. Update Privacy Settings
  app.patch('/api/users/privacy', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const schema = z.object({
      privacyAllowMessages: z.enum(['anyone', 'contacts_only']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'privacyAllowMessages must be "anyone" or "contacts_only"' });
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: { privacyAllowMessages: parsed.data.privacyAllowMessages },
    });

    return reply.send({
      success: true,
      privacyAllowMessages: updated.privacyAllowMessages,
    });
  });
}
