import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './auth.js';
import { chatRoutes } from './chats.js';
import { contactRoutes } from './contacts.js';
import { websocketRoutes } from './ws.js';
import { keyRoutes } from './keys.js';
import { pushRoutes } from './push.js';
import { mediaRoutes } from './media.js';
import { turnRoutes } from './turn.js';
import { retentionRoutes, startRetentionScheduler } from './retention.js';
import { wsTicketRoutes } from './wsTicket.js';
import { backupRoutes } from './backup.js';
import { passkeyRoutes } from './passkey.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

// Strict secret enforcement: Refuse to start if JWT_SECRET is missing or shorter than 32 bytes
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  console.error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 random bytes.');
  process.exit(1);
}

const app = Fastify({
  logger: {
    level: isProduction ? 'info' : 'debug',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["sec-websocket-protocol"]',
        'res.headers["set-cookie"]',
        '*.token',
        '*.ticket',
        '*.credential',
        '*.password',
        '*.privateKey',
        '*.identityKey',
        '*.identitySignKey',
        '*.signedPreKeySignature',
        '*.nonce',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  },
});

// Security headers with strict Content Security Policy
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'", 'https://accounts.google.com/gsi/client'],
      frameSrc: ["'self'", 'https://accounts.google.com/gsi/'],
      connectSrc: [
        "'self'",
        'wss:',
        'ws:',
        'https://accounts.google.com/gsi/',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://accounts.google.com/gsi/style',
        'https://fonts.googleapis.com',
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }
    : false,
  referrerPolicy: {
    policy: 'no-referrer',
  },
});

// Explicit CORS allowlist from APP_ORIGIN
const rawOrigin = process.env.APP_ORIGIN;
const allowedOrigins = rawOrigin
  ? rawOrigin.split(',').map((o) => o.trim()).filter(Boolean)
  : (isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001']);

if (isProduction && allowedOrigins.length === 0) {
  console.error('FATAL: APP_ORIGIN environment variable is required in production (e.g. APP_ORIGIN=https://129.225.107.71.sslip.io)');
  process.exit(1);
}

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`Origin ${origin} is not allowed by CORS allowlist`), false);
  },
  credentials: true,
});

await app.register(cookie);

await app.register(jwt, {
  secret: JWT_SECRET,
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

// Health check and public configuration
app.get('/api/health', async () => {
  return {
    status: 'ok',
    service: 'editorial-messenger-api',
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    timestamp: new Date().toISOString(),
  };
});

// App routes
await app.register(authRoutes);
await app.register(chatRoutes);
await app.register(contactRoutes);
await app.register(websocketRoutes);
await app.register(keyRoutes);
await app.register(pushRoutes);
await app.register(mediaRoutes);
await app.register(turnRoutes);
await app.register(retentionRoutes);
await app.register(wsTicketRoutes);
await app.register(backupRoutes);
await app.register(passkeyRoutes);

// Start message retention cleanup scheduler (runs daily in background)
startRetentionScheduler();

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
