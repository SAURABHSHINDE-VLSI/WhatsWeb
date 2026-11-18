import { FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { TokenPayload, authenticate, serializeSafeUser } from './auth.js';

export async function chatRoutes(app: FastifyInstance) {
  // List chats: ONLY partners with mutual contact or existing exchanged messages.
  // Never list all users in the system!
  app.get('/api/chats', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const currentUserId = payload.userId;

    // Find all contact records for current user
    const contacts = await prisma.contact.findMany({
      where: { userId: currentUserId },
      select: { contactId: true, isPinned: true, isMuted: true },
    });

    const contactMap = new Map(contacts.map((c) => [c.contactId, c]));

    // Find all user IDs with exchanged messages
    const sentMessages = await prisma.message.findMany({
      where: { senderId: currentUserId },
      select: { receiverId: true },
      distinct: ['receiverId'],
    });

    const receivedMessages = await prisma.message.findMany({
      where: { receiverId: currentUserId },
      select: { senderId: true },
      distinct: ['senderId'],
    });

    const partnerIdsSet = new Set<string>();
    for (const c of contacts) partnerIdsSet.add(c.contactId);
    for (const m of sentMessages) partnerIdsSet.add(m.receiverId);
    for (const m of receivedMessages) partnerIdsSet.add(m.senderId);

    // Filter out blocked users (in either direction)
    const blocks = await prisma.blockedUser.findMany({
      where: {
        OR: [
          { blockerId: currentUserId },
          { blockedId: currentUserId },
        ],
      },
    });

    for (const b of blocks) {
      partnerIdsSet.delete(b.blockerId === currentUserId ? b.blockedId : b.blockerId);
    }

    const partnerIds = Array.from(partnerIdsSet);

    if (partnerIds.length === 0) {
      return reply.send({ chats: [] });
    }

    const partners = await prisma.user.findMany({
      where: { id: { in: partnerIds } },
    });

    const chatSummaries = await Promise.all(
      partners.map(async (partner) => {
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

        const contact = contactMap.get(partner.id);

        return {
          id: partner.id,
          name: partner.displayName || partner.username || 'Contact',
          username: partner.username,
          avatarUrl: partner.avatarUrl,
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

    // Sort by pinned first, then lastMessage createdAt descending
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

    // Check if blocked
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: partnerId },
          { blockerId: partnerId, blockedId: currentUserId },
        ],
      },
    });

    if (block) {
      return reply.status(403).send({ error: 'Cannot view messages with this user' });
    }

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
        nonce: m.nonce,
        ephemeralKey: m.ephemeralKey,
        recipientPreKeyId: m.recipientPreKeyId,
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
