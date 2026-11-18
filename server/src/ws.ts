import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { prisma } from './db.js';
import { sendZeroPlaintextPush } from './push.js';

interface SocketSession {
  userId: string;
  username: string;
}

const userSockets = new Map<string, Set<WebSocket>>();
const socketSessions = new Map<WebSocket, SocketSession>();

function sendJson(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToUser(userId: string, data: unknown) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const ws of sockets) {
      sendJson(ws, data);
    }
  }
}

export function isUserOnline(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

async function areUsersBlocked(userA: string, userB: string): Promise<boolean> {
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
  });
  return Boolean(block);
}

export async function websocketRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    let authenticatedUserId: string | null = null;

    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const decoded = app.jwt.verify<{ userId: string; username: string }>(token);
        authenticatedUserId = decoded.userId;
        registerUserSocket(socket, decoded.userId, decoded.username);
      } catch (err) {
        sendJson(socket, { event: 'error', message: 'Invalid token in query' });
      }
    }

    socket.on('message', async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const event = payload.event;
        const data = payload.data || {};

        if (event === 'auth') {
          const authJwt = data.token;
          try {
            const decoded = app.jwt.verify<{ userId: string; username: string }>(authJwt);
            authenticatedUserId = decoded.userId;
            registerUserSocket(socket, decoded.userId, decoded.username);
            sendJson(socket, { event: 'auth:success', userId: decoded.userId });
          } catch (e) {
            sendJson(socket, { event: 'auth:error', message: 'Authentication failed' });
            socket.close();
          }
          return;
        }

        if (!authenticatedUserId) {
          sendJson(socket, { event: 'error', message: 'Not authenticated' });
          return;
        }

        const currentUserId = authenticatedUserId;

        // 2. Encrypted message forwarding
        if (event === 'message:send') {
          const {
            clientMessageId,
            receiverId,
            ciphertext,
            content,
            nonce,
            ephemeralKey,
            recipientPreKeyId,
            type = 'text',
            mediaUrl,
            replyToId,
          } = data;

          const rawCiphertext = ciphertext || content;
          const rawNonce = nonce || 'none';

          if (!receiverId || !rawCiphertext) {
            sendJson(socket, { event: 'error', message: 'Missing receiverId or ciphertext' });
            return;
          }

          // Check if users are blocked
          if (await areUsersBlocked(currentUserId, receiverId)) {
            sendJson(socket, { event: 'error', message: 'Message cannot be delivered to this user' });
            return;
          }

          // Check recipient privacy setting & requests
          const receiver = await prisma.user.findUnique({
            where: { id: receiverId },
            include: {
              contacts: { where: { contactId: currentUserId } },
            },
          });

          if (!receiver) {
            sendJson(socket, { event: 'error', message: 'Recipient not found' });
            return;
          }

          const isEstablishedContact = receiver.contacts.length > 0;

          if (!isEstablishedContact) {
            if (receiver.privacyAllowMessages === 'contacts_only') {
              sendJson(socket, {
                event: 'error',
                message: 'This user only receives messages from accepted contacts',
              });
              return;
            }

            // Stranger contact: Ensure a pending ContactRequest exists so it appears in Requests inbox
            await prisma.contactRequest.upsert({
              where: {
                senderId_receiverId: {
                  senderId: currentUserId,
                  receiverId,
                },
              },
              create: {
                senderId: currentUserId,
                receiverId,
                status: 'pending',
              },
              update: {},
            });
          }

          // Deduplication by clientMessageId
          if (clientMessageId) {
            const existing = await prisma.message.findUnique({
              where: { clientMessageId },
            });
            if (existing) {
              sendJson(socket, {
                event: 'message:ack',
                clientMessageId,
                messageId: existing.id,
                status: existing.status,
                createdAt: existing.createdAt,
              });
              return;
            }
          }

          const receiverOnline = isUserOnline(receiverId);
          const initialStatus = receiverOnline ? 'delivered' : 'sent';
          const now = new Date();

          // Save strictly encrypted ciphertext to database
          const message = await prisma.message.create({
            data: {
              clientMessageId,
              senderId: currentUserId,
              receiverId,
              content: rawCiphertext, // Encrypted Base64 ciphertext
              nonce: rawNonce,
              ephemeralKey,
              recipientPreKeyId: typeof recipientPreKeyId === 'number' ? recipientPreKeyId : null,
              type,
              mediaUrl,
              replyToId,
              status: initialStatus,
              deliveredAt: receiverOnline ? now : null,
            },
          });

          // Acknowledge sender
          sendJson(socket, {
            event: 'message:ack',
            clientMessageId,
            messageId: message.id,
            status: initialStatus,
            createdAt: message.createdAt,
          });

          // Forward encrypted blob to receiver
          if (receiverOnline) {
            broadcastToUser(receiverId, {
              event: 'message:new',
              message: {
                id: message.id,
                clientMessageId: message.clientMessageId,
                senderId: message.senderId,
                receiverId: message.receiverId,
                ciphertext: rawCiphertext,
                content: rawCiphertext,
                nonce: rawNonce,
                ephemeralKey: message.ephemeralKey,
                recipientPreKeyId: message.recipientPreKeyId,
                type: message.type,
                mediaUrl: message.mediaUrl,
                status: initialStatus,
                replyToId: message.replyToId,
                createdAt: message.createdAt,
              },
            });
          } else {
            // Recipient is offline: send generic trigger Web Push notification (ZERO plaintext)
            sendZeroPlaintextPush(receiverId).catch(() => {});
          }
          return;
        }

        // 3. Read receipt
        if (event === 'message:read') {
          const { partnerId, messageIds } = data;
          if (!partnerId) return;

          if (await areUsersBlocked(currentUserId, partnerId)) return;

          const now = new Date();
          let updatedIds: string[] = [];

          if (Array.isArray(messageIds) && messageIds.length > 0) {
            await prisma.message.updateMany({
              where: {
                id: { in: messageIds },
                receiverId: currentUserId,
                status: { not: 'read' },
              },
              data: {
                status: 'read',
                readAt: now,
              },
            });
            updatedIds = messageIds;
          } else {
            const unread = await prisma.message.findMany({
              where: {
                senderId: partnerId,
                receiverId: currentUserId,
                status: { not: 'read' },
              },
              select: { id: true },
            });
            updatedIds = unread.map((m) => m.id);

            await prisma.message.updateMany({
              where: {
                senderId: partnerId,
                receiverId: currentUserId,
                status: { not: 'read' },
              },
              data: {
                status: 'read',
                readAt: now,
              },
            });
          }

          if (updatedIds.length > 0) {
            broadcastToUser(partnerId, {
              event: 'message:read_receipt',
              readByUserId: currentUserId,
              messageIds: updatedIds,
              readAt: now,
            });
          }
          return;
        }

        // 4. Typing
        if (event === 'typing') {
          const { receiverId, isTyping } = data;
          if (receiverId) {
            if (await areUsersBlocked(currentUserId, receiverId)) return;
            broadcastToUser(receiverId, {
              event: 'typing',
              senderId: currentUserId,
              isTyping: Boolean(isTyping),
            });
          }
          return;
        }

        // 5. WebRTC Call Signaling (Voice & Video Calls)
        if (event === 'call:initiate') {
          const { receiverId, callerName, callerAvatarTint, callType, offer } = data;
          if (!receiverId) return;

          if (await areUsersBlocked(currentUserId, receiverId)) {
            sendJson(socket, {
              event: 'call:user_offline',
              receiverId,
            });
            return;
          }

          if (isUserOnline(receiverId)) {
            broadcastToUser(receiverId, {
              event: 'call:incoming',
              callerId: currentUserId,
              callerName: callerName || 'Contact',
              callerAvatarTint: callerAvatarTint ?? 0,
              callType: callType || 'voice',
              offer,
            });
          } else {
            sendJson(socket, {
              event: 'call:user_offline',
              receiverId,
            });
          }
          return;
        }

        if (event === 'call:accept') {
          const { callerId, answer } = data;
          if (callerId) {
            if (await areUsersBlocked(currentUserId, callerId)) return;
            broadcastToUser(callerId, {
              event: 'call:accepted',
              receiverId: currentUserId,
              answer,
            });
          }
          return;
        }

        if (event === 'call:reject') {
          const { callerId, reason } = data;
          if (callerId) {
            broadcastToUser(callerId, {
              event: 'call:rejected',
              receiverId: currentUserId,
              reason: reason || 'declined',
            });
          }
          return;
        }

        if (event === 'call:ice_candidate') {
          const { targetUserId, candidate } = data;
          if (targetUserId && candidate) {
            if (await areUsersBlocked(currentUserId, targetUserId)) return;
            broadcastToUser(targetUserId, {
              event: 'call:ice_candidate',
              senderId: currentUserId,
              candidate,
            });
          }
          return;
        }

        if (event === 'call:end') {
          const { targetUserId } = data;
          if (targetUserId) {
            broadcastToUser(targetUserId, {
              event: 'call:ended',
              senderId: currentUserId,
            });
          }
          return;
        }

        // 6. Ping
        if (event === 'ping') {
          sendJson(socket, { event: 'pong', timestamp: Date.now() });
        }
      } catch (err) {
        console.error('[WS Error]', err);
      }
    });

    socket.on('close', () => {
      if (authenticatedUserId) {
        unregisterUserSocket(socket, authenticatedUserId);
      }
    });
  });
}

function registerUserSocket(socket: WebSocket, userId: string, username: string) {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(userId, sockets);
  }
  sockets.add(socket);
  socketSessions.set(socket, { userId, username });

  broadcastPresence(userId, true);
  console.log(`[WS] Connected: ${username} (${userId})`);
}

function unregisterUserSocket(socket: WebSocket, userId: string) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      userSockets.delete(userId);
      broadcastPresence(userId, false);
    }
  }
  socketSessions.delete(socket);
  console.log(`[WS] Disconnected: ${userId}`);
}

async function broadcastPresence(userId: string, isOnline: boolean) {
  // Find all users who have blocked or are blocked by this user to exclude them
  const blocks = await prisma.blockedUser.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
  });
  const excludedIds = new Set<string>();
  for (const b of blocks) {
    excludedIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
  }

  const presenceEvent = {
    event: 'presence',
    userId,
    isOnline,
    lastSeen: new Date().toISOString(),
  };

  for (const [targetUserId, socketSet] of userSockets.entries()) {
    if (targetUserId === userId || excludedIds.has(targetUserId)) continue;
    for (const ws of socketSet) {
      sendJson(ws, presenceEvent);
    }
  }
}
