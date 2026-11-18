import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { authenticate } from './auth.js';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
const CHUNKS_DIR = path.resolve(UPLOAD_DIR, 'chunks');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// Clean up stale chunk directories older than 2 hours
function cleanupStaleChunks() {
  try {
    const now = Date.now();
    const maxAgeMs = 2 * 60 * 60 * 1000;
    if (fs.existsSync(CHUNKS_DIR)) {
      const entries = fs.readdirSync(CHUNKS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(CHUNKS_DIR, entry.name);
          const stat = fs.statSync(dirPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.rmSync(dirPath, { recursive: true, force: true });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Media Chunks Cleanup] Warning:', err);
  }
}

// Run cleanup once on startup and every 30 minutes
cleanupStaleChunks();
setInterval(cleanupStaleChunks, 30 * 60 * 1000).unref();

export async function mediaRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });

  // 1. Single-shot upload of encrypted ciphertext blob
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

  // 2. Resumable Chunked Upload - Init
  app.post('/api/media/upload/init', { preHandler: [authenticate] }, async (req, reply) => {
    const schema = z.object({
      totalChunks: z.number().int().min(1).max(200),
      totalSize: z.number().int().min(1).max(25 * 1024 * 1024), // Max 25MB
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid upload init parameters', details: parsed.error.format() });
    }

    const { totalChunks, totalSize } = parsed.data;
    const uploadId = crypto.randomBytes(16).toString('hex');
    const uploadPath = path.join(CHUNKS_DIR, uploadId);

    fs.mkdirSync(uploadPath, { recursive: true });

    // Store metadata
    fs.writeFileSync(
      path.join(uploadPath, 'meta.json'),
      JSON.stringify({ uploadId, totalChunks, totalSize, createdAt: Date.now() }),
      'utf8'
    );

    return reply.status(201).send({
      success: true,
      uploadId,
    });
  });

  // 3. Resumable Chunked Upload - Upload Single Chunk
  app.post('/api/media/upload/chunk', { preHandler: [authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: 'No chunk file provided' });
    }

    const fields = data.fields as Record<string, any>;
    const uploadId = fields.uploadId?.value || req.headers['x-upload-id'];
    const chunkIndexStr = fields.chunkIndex?.value || req.headers['x-chunk-index'];

    if (!uploadId || !/^[a-f0-9]{32}$/.test(uploadId)) {
      return reply.status(400).send({ error: 'Invalid or missing uploadId' });
    }

    const chunkIndex = parseInt(String(chunkIndexStr), 10);
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return reply.status(400).send({ error: 'Invalid chunkIndex' });
    }

    const uploadPath = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(uploadPath)) {
      return reply.status(404).send({ error: 'Upload session not found or expired' });
    }

    const chunkFilePath = path.join(uploadPath, `chunk_${chunkIndex}`);
    const writeStream = fs.createWriteStream(chunkFilePath);
    await pipeline(data.file, writeStream);

    return reply.send({
      success: true,
      chunkIndex,
    });
  });

  // 4. Resumable Chunked Upload - Complete & Assemble
  app.post('/api/media/upload/complete', { preHandler: [authenticate] }, async (req, reply) => {
    const schema = z.object({
      uploadId: z.string().regex(/^[a-f0-9]{32}$/),
      totalChunks: z.number().int().min(1).max(200),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid complete parameters' });
    }

    const { uploadId, totalChunks } = parsed.data;
    const uploadPath = path.join(CHUNKS_DIR, uploadId);

    if (!fs.existsSync(uploadPath)) {
      return reply.status(404).send({ error: 'Upload session not found or expired' });
    }

    // Verify all chunk files exist
    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(uploadPath, `chunk_${i}`);
      if (!fs.existsSync(chunkFile)) {
        return reply.status(400).send({ error: `Missing chunk ${i}` });
      }
    }

    const fileId = crypto.randomBytes(16).toString('hex') + '.enc';
    const finalFilePath = path.join(UPLOAD_DIR, fileId);
    const finalWriteStream = fs.createWriteStream(finalFilePath);

    // Concatenate chunks in order
    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(uploadPath, `chunk_${i}`);
      const chunkBuffer = fs.readFileSync(chunkFile);
      finalWriteStream.write(chunkBuffer);
    }
    await new Promise((resolve) => finalWriteStream.end(resolve));

    // Clean up temporary chunks directory
    try {
      fs.rmSync(uploadPath, { recursive: true, force: true });
    } catch (err) {
      console.warn('[Chunk cleanup]', err);
    }

    return reply.status(201).send({
      success: true,
      fileId,
      mediaUrl: `/api/media/${fileId}`,
    });
  });

  // 5. Serve raw ciphertext file (strict immutable headers, path traversal protected)
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
