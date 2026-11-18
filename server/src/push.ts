import { FastifyInstance } from 'fastify';
import { setVapidDetails, sendNotification } from 'web-push';
import { z } from 'zod';
import { prisma } from './db.js';
import { TokenPayload, authenticate } from './auth.js';

// VAPID keys from environment only (never hardcoded)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@whatsus.app';

let pushEnabled = false;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushEnabled = true;
  } catch (err) {
    console.warn('[Push] Invalid VAPID configuration, web push is disabled:', err);
  }
} else {
  console.warn('[Push] VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing. Web push is disabled.');
}

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
export async function sendZeroPlaintextPush(receiverId: string) {
  if (!pushEnabled) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: receiverId },
  });

  if (subscriptions.length === 0) return;

  // Strict generic trigger payload without message IDs or sender identities
  const payload = JSON.stringify({
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
  app.get('/api/push/vapid-public-key', async (req, reply) => {
    if (!vapidPublicKey) {
      return reply.status(503).send({ error: 'Push notifications are not configured on this server' });
    }
    return { publicKey: vapidPublicKey };
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
