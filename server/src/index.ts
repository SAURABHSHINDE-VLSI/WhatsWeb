import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './auth.js';
import { chatRoutes } from './chats.js';
import { websocketRoutes } from './ws.js';
import { keyRoutes } from './keys.js';
import { pushRoutes } from './push.js';
import { mediaRoutes } from './media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: {
    level: 'info',
  },
});

// Plugins
await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(cookie);

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'editorial-calm-messenger-jwt-super-secret-key-32chars',
  cookie: {
    cookieName: 'refreshToken',
    signed: false,
  },
});

await app.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB
  },
});

// Health check
app.get('/api/health', async () => {
  return { status: 'ok', service: 'editorial-messenger-api', timestamp: new Date().toISOString() };
});

// App routes
await app.register(authRoutes);
await app.register(chatRoutes);
await app.register(websocketRoutes);
await app.register(keyRoutes);
await app.register(pushRoutes);
await app.register(mediaRoutes);

// Static client assets serving (for single-server production deployment)
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  await app.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url && (request.raw.url.startsWith('/api') || request.raw.url.startsWith('/ws'))) {
      reply.status(404).send({ error: 'Endpoint not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
}

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`\n🌿 Editorial Messenger Server is running on http://${HOST}:${PORT}`);
  console.log(`⚡ WebSocket endpoint available at ws://${HOST}:${PORT}/ws\n`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
