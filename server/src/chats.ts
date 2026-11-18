import { FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { TokenPayload, authenticate } from './auth.js';

export async function chatRoutes(app: FastifyInstance) {
  // List users
  app.get('/api/users', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const users = await prisma.user.findMany({
      where: {
        id: { not: payload.userId },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        phoneNumber: true,
        avatarTint: true,
      },
    });

    return reply.send({ users });
  });

  // List recent chats with partner info, last message, and unread count
  app.get('/api/chats', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    // Find all users the current user has exchanged messages with, or all available demo users
    const allOtherUsers = await prisma.user.findMany({
      where: { id: { not: currentUserId } },
      select: {
        id: true,
        username: true,
        displayName: true,
        phoneNumber: true,
        avatarTint: true,
      },
    });

    const chatSummaries = await Promise.all(
      allOtherUsers.map(async (partner) => {
        // Last message
        const lastMessage = await prisma.message.findFirst({
          where: {
            OR: [
              { senderId: currentUserId, receiverId: partner.id },
              { senderId: partner.id, receiverId: currentUserId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        // Unread count
        const unreadCount = await prisma.message.count({
          where: {
            senderId: partner.id,
            receiverId: currentUserId,
            status: { not: 'read' },
          },
        });

        const contact = await prisma.contact.findUnique({
          where: {
            userId_contactId: {
              userId: currentUserId,
              contactId: partner.id,
            },
          },
        });

        return {
          id: partner.id,
          name: partner.displayName,
          username: partner.username,
          phoneNumber: partner.phoneNumber,
          tint: partner.avatarTint,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                type: lastMessage.type,
                createdAt: lastMessage.createdAt,
                status: lastMessage.status,
                isSent: lastMessage.senderId === currentUserId,
              }
            : null,
          unreadCount,
          isPinned: contact?.isPinned ?? false,
          isMuted: contact?.isMuted ?? false,
        };
      })
    );

    // Sort by lastMessage createdAt desc, then pinned
    chatSummaries.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return reply.send({ chats: chatSummaries });
  });

  // Get message history for a 1:1 chat
  app.get('/api/chats/:partnerId/messages', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;
    const { partnerId } = req.params as { partnerId: string };

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: partnerId },
          { senderId: partnerId, receiverId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return reply.send({
      messages: messages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        senderId: m.senderId,
        receiverId: m.receiverId,
        isSent: m.senderId === currentUserId,
        content: m.content,
        type: m.type,
        mediaUrl: m.mediaUrl,
        status: m.status,
        replyToId: m.replyToId,
        createdAt: m.createdAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
      })),
    });
  });
}
