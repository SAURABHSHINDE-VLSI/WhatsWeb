import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from './db.js';
import { authenticate, TokenPayload } from './auth.js';

interface MemoryTicket {
  ticket: string;
  userId: string;
  username: string;
  expiresAt: number;
}

const memoryTickets = new Map<string, MemoryTicket>();

// Periodic memory cleanup every 60 seconds (unref so it doesn't block process exit)
const ticketCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ticket, data] of memoryTickets.entries()) {
    if (data.expiresAt < now) {
      memoryTickets.delete(ticket);
    }
  }
}, 60 * 1000);
ticketCleanupInterval.unref();

/**
 * Generate a cryptographically random, 60-second single-use ticket
 * for WebSocket authentication.
 * Never send JWT tokens in WebSocket URL query strings!
 */
export async function createWsTicket(userId: string, username?: string): Promise<{ ticket: string; expiresIn: number }> {
  const ticket = crypto.randomBytes(32).toString('base64url');
  const expiresIn = 60; // 60 seconds
  const expiresAtDate = new Date(Date.now() + expiresIn * 1000);

  // Store in memory for instant lookups
  memoryTickets.set(ticket, {
    ticket,
    userId,
    username: username || '',
    expiresAt: expiresAtDate.getTime(),
  });

  // Attempt database persistence if table exists
  try {
    if ((prisma as any).wsTicket) {
      await (prisma as any).wsTicket.create({
        data: {
          ticket,
          userId,
          expiresAt: expiresAtDate,
        },
      });
    }
  } catch (err) {
    // Non-fatal if memory ticket is already set
  }

  return {
    ticket,
    expiresIn,
  };
}

/**
 * Consume a WebSocket ticket atomically.
 * Returns user details if valid; returns null if ticket is invalid, expired, or already used.
 * Ticket is deleted immediately upon consumption (strictly single-use).
 */
export async function consumeWsTicket(
  ticket: string
): Promise<{ userId: string; username: string } | null> {
  if (!ticket || typeof ticket !== 'string') {
    return null;
  }

  // 1. Check in-memory store first
  const mem = memoryTickets.get(ticket);
  if (mem) {
    memoryTickets.delete(ticket); // Atomic single-use deletion
    try {
      if ((prisma as any).wsTicket) {
        await (prisma as any).wsTicket.updateMany({
          where: { ticket },
          data: { used: true },
        });
      }
    } catch (_) {}

    if (mem.expiresAt < Date.now()) {
      return null;
    }
    return { userId: mem.userId, username: mem.username };
  }

  // 2. Fall back to DB check if present
  try {
    if ((prisma as any).wsTicket) {
      const dbTicket = await (prisma as any).wsTicket.findUnique({
        where: { ticket },
        include: { user: true },
      });

      if (!dbTicket || dbTicket.used || dbTicket.expiresAt < new Date()) {
        return null;
      }

      // Mark used immediately
      await (prisma as any).wsTicket.update({
        where: { id: dbTicket.id },
        data: { used: true },
      });

      return {
        userId: dbTicket.userId,
        username: dbTicket.user?.username || '',
      };
    }
  } catch (err) {
    // Ignore DB errors if any
  }

  return null;
}

export async function wsTicketRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/ws-ticket
   * Request a short-lived (60s), single-use ticket for WebSocket connection.
   * Requires Bearer JWT in Authorization header.
   */
  app.post('/api/auth/ws-ticket', { preHandler: [authenticate] }, async (req, reply) => {
    const user = req.user as TokenPayload;
    if (!user || !user.userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const res = await createWsTicket(user.userId, user.username || undefined);
    return reply.status(201).send(res);
  });
}
