import { FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { authenticate } from './auth.js';

export interface RetentionCleanupResult {
  retentionDays: number;
  cutoff: Date;
  purgedDeliveredAndRead: number;
  purgedUndeliveredQueue: number;
  totalPurged: number;
}

/**
 * Enforce message retention policy:
 * 1. Delivered and read messages older than retention window (default 30 days) are purged.
 * 2. Undelivered messages queued longer than retention window are purged to prevent unbounded growth.
 */
export async function runMessageRetentionCleanup(
  customDays?: number
): Promise<RetentionCleanupResult> {
  const retentionDays =
    customDays ?? parseInt(process.env.MESSAGE_RETENTION_DAYS || '30', 10);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // 1. Purge delivered & read messages older than cutoff
  const readDeleteResult = await prisma.message.deleteMany({
    where: {
      status: 'read',
      OR: [
        { readAt: { lt: cutoff } },
        { deliveredAt: { lt: cutoff } },
        { createdAt: { lt: cutoff } },
      ],
    },
  });

  // Also purge delivered messages (not yet marked read) older than cutoff
  const deliveredDeleteResult = await prisma.message.deleteMany({
    where: {
      status: 'delivered',
      OR: [
        { deliveredAt: { lt: cutoff } },
        { createdAt: { lt: cutoff } },
      ],
    },
  });

  const purgedDeliveredAndRead = readDeleteResult.count + deliveredDeleteResult.count;

  // 2. Undelivered message queue capped at retention window
  const queueDeleteResult = await prisma.message.deleteMany({
    where: {
      status: 'sent',
      createdAt: { lt: cutoff },
    },
  });
  const purgedUndeliveredQueue = queueDeleteResult.count;

  return {
    retentionDays,
    cutoff,
    purgedDeliveredAndRead,
    purgedUndeliveredQueue,
    totalPurged: purgedDeliveredAndRead + purgedUndeliveredQueue,
  };
}

let retentionTimer: NodeJS.Timeout | null = null;

export function startRetentionScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  if (retentionTimer) clearInterval(retentionTimer);

  // Run initial cleanup in background
  runMessageRetentionCleanup().catch((err) => {
    console.error('[Retention Cleanup Error]', err);
  });

  retentionTimer = setInterval(() => {
    runMessageRetentionCleanup().catch((err) => {
      console.error('[Retention Cleanup Error]', err);
    });
  }, intervalMs);
  retentionTimer.unref();

  return retentionTimer;
}

export function stopRetentionScheduler() {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}

export async function retentionRoutes(app: FastifyInstance) {
  // Manual trigger / status check (authenticated)
  app.post('/api/retention/cleanup', { preHandler: [authenticate] }, async (req, reply) => {
    try {
      const result = await runMessageRetentionCleanup();
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Retention cleanup failed', details: err.message });
    }
  });
}
