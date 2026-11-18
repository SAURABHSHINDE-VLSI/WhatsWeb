import { FastifyInstance } from 'fastify';
import { setVapidDetails, sendNotification } from 'web-push';
import { z } from 'zod';
import { prisma } from './db.js';
import { TokenPayload, authenticate } from './auth.js';

// Persistent or generated VAPID keys
const vapidKeys = {
  publicKey:
    process.env.VAPID_PUBLIC_KEY ||
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  privateKey:
    process.env.VAPID_PRIVATE_KEY ||
    'UUxI4b6P8k-489q7E6K7Ew0h3gZ9Jc1Y0rL8bM2vK5A',
};

setVapidDetails(
  'mailto:security@editorial-calm-chat.local',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Dispatch generic trigger push notification with ZERO plaintext in payload.
 * The client service worker receives the notification, fetches the encrypted blob,
 * and decrypts it locally before showing it to the user.
 */
export async function sendZeroPlaintextPush(receiverId: string, messageId: string, senderName: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: receiverId },
  });

  if (subscriptions.length === 0) return;

  // STRICT ZERO PLAINTEXT PAYLOAD
  const payload = JSON.stringify({
    title: senderName || 'New Message',
    messageId,
    type: 'new_message',
    timestamp: new Date().toISOString(),
  });

  for (const sub of subscriptions) {
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Expired or unsubscribed
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
}

export async function pushRoutes(app: FastifyInstance) {
  // Public VAPID Key
  app.get('/api/push/vapid-public-key', async () => {
    return { publicKey: vapidKeys.publicKey };
  });

  // Subscribe
  app.post('/api/push/subscribe', { preHandler: [authenticate] }, async (req, reply) => {
    const payload = req.user as TokenPayload;
    const parse = subscribeSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid subscription payload' });
    }

    const { endpoint, keys } = parse.data;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: payload.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      update: {
        userId: payload.userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return reply.status(201).send({ success: true, message: 'Push subscription registered' });
  });

  // Unsubscribe
  app.post('/api/push/unsubscribe', { preHandler: [authenticate] }, async (req, reply) => {
    const { endpoint } = req.body as { endpoint: string };
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    }
    return reply.send({ success: true });
  });
}
