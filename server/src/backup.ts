import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from './db.js';
import { authenticate } from './auth.js';

const BackupPayloadSchema = z.object({
  backupCiphertext: z.string().min(1).max(50 * 1024 * 1024, 'Backup payload exceeds 50MB limit'),
  salt: z.string().min(16).max(128),
  nonce: z.string().min(16).max(128),
  version: z.number().int().min(1).default(1),
});

export async function backupRoutes(app: FastifyInstance) {
  // 1. Upload / Replace Encrypted Backup (Zero Server Plaintext)
  app.post(
    '/api/backup',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = BackupPayloadSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Invalid backup payload',
          details: parseResult.error.flatten(),
        });
      }

      const { backupCiphertext, salt, nonce, version } = parseResult.data;
      const userId = (request.user as { userId: string }).userId;
      const sizeBytes = Buffer.byteLength(backupCiphertext, 'utf8');

      const backup = await prisma.userBackup.upsert({
        where: { userId },
        create: {
          userId,
          backupCiphertext,
          salt,
          nonce,
          version,
          sizeBytes,
        },
        update: {
          backupCiphertext,
          salt,
          nonce,
          version,
          sizeBytes,
        },
      });

      return reply.send({
        success: true,
        version: backup.version,
        sizeBytes: backup.sizeBytes,
        updatedAt: backup.updatedAt,
      });
    }
  );

  // 2. Download Encrypted Backup
  app.get(
    '/api/backup',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;

      const backup = await prisma.userBackup.findUnique({
        where: { userId },
      });

      if (!backup) {
        return reply.send({ backup: null });
      }

      return reply.send({
        backup: {
          backupCiphertext: backup.backupCiphertext,
          salt: backup.salt,
          nonce: backup.nonce,
          version: backup.version,
          sizeBytes: backup.sizeBytes,
          updatedAt: backup.updatedAt,
        },
      });
    }
  );

  // 3. Delete Cloud Backup
  app.delete(
    '/api/backup',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.user as { userId: string }).userId;

      await prisma.userBackup.deleteMany({
        where: { userId },
      });

      return reply.send({ success: true });
    }
  );
}
