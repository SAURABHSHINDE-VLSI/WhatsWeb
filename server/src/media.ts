import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { authenticate } from './auth.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function mediaRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB limit
    },
  });

  // Upload encrypted media ciphertext blob
  app.post('/api/media/upload', { preHandler: [authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: 'No media file provided' });
    }

    const fileId = crypto.randomBytes(16).toString('hex') + '.enc';
    const filePath = path.join(UPLOAD_DIR, fileId);

    const writeStream = fs.createWriteStream(filePath);
    await pipeline(data.file, writeStream);

    return reply.status(201).send({
      success: true,
      fileId,
      mediaUrl: `/api/media/${fileId}`,
    });
  });

  // Serve raw ciphertext file
  app.get('/api/media/:fileId', async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const fileIdParamSchema = z.string().regex(/^[a-f0-9]{32}\.enc$/);
    const parsed = fileIdParamSchema.safeParse(fileId);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid media file ID format' });
    }

    const safeFileId = path.basename(fileId);
    const filePath = path.join(UPLOAD_DIR, safeFileId);

    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Encrypted media not found' });
    }

    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });
}
