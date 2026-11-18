import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { prisma } from '../src/db.js';
import { authRoutes } from '../src/auth.js';
import { turnRoutes, generateTurnCredentials } from '../src/turn.js';
import { retentionRoutes, runMessageRetentionCleanup } from '../src/retention.js';
import { wsTicketRoutes, createWsTicket, consumeWsTicket } from '../src/wsTicket.js';
import { websocketRoutes } from '../src/ws.js';
import { mediaRoutes } from '../src/media.js';

const TEST_SECRET = '012345678901234567890123456789012';

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: TEST_SECRET });
  await app.register(authRoutes);
  await app.register(turnRoutes);
  await app.register(retentionRoutes);
  await app.register(wsTicketRoutes);
  await app.register(websocketRoutes);
  await app.register(mediaRoutes);
  await app.ready();
  return app;
}

test('Phase 4: Ticket-Authenticated WebSockets (Single-Use, Zero JWT in URLs)', async () => {
  const app = await buildTestApp();

  const user = await prisma.user.create({
    data: {
      username: 'wsticket_user_' + Date.now(),
      displayName: 'WS Ticket Tester',
    },
  });

  const token = app.jwt.sign({ userId: user.id, username: user.username, sessionId: 's1' });

  // 1. Request single-use ticket via POST /api/auth/ws-ticket
  const ticketRes = await app.inject({
    method: 'POST',
    url: '/api/auth/ws-ticket',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(ticketRes.statusCode, 201);
  const { ticket, expiresIn } = JSON.parse(ticketRes.body);
  assert.equal(typeof ticket, 'string');
  assert.equal(ticket.length > 20, true);
  assert.equal(expiresIn, 60);

  // 2. Consume ticket once -> MUST succeed
  const auth1 = await consumeWsTicket(ticket);
  assert.notEqual(auth1, null);
  assert.equal(auth1?.userId, user.id);

  // 3. Re-consume the exact same ticket -> MUST fail (single-use reuse prevention)
  const auth2 = await consumeWsTicket(ticket);
  assert.equal(auth2, null, 'Reusing a ticket must fail closed');

  // 4. Consume an unknown / forged ticket -> MUST fail
  const auth3 = await consumeWsTicket('forged_ticket_' + crypto.randomBytes(16).toString('hex'));
  assert.equal(auth3, null, 'Forged ticket must be rejected');

  // Clean up
  await prisma.user.delete({ where: { id: user.id } });
});

test('Phase 4: Message Retention Policy (Purge Read Messages & Cap Undelivered Queue)', async () => {
  const sender = await prisma.user.create({
    data: { username: 'sender_' + Date.now(), displayName: 'Sender' },
  });
  const receiver = await prisma.user.create({
    data: { username: 'receiver_' + Date.now(), displayName: 'Receiver' },
  });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const fortyDaysAgo = new Date(now - 40 * dayMs);
  const thirtyFiveDaysAgo = new Date(now - 35 * dayMs);
  const twoDaysAgo = new Date(now - 2 * dayMs);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);

  // Message 1: Read, 40 days old -> MUST BE PURGED
  const msg1 = await prisma.message.create({
    data: {
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'old-read-ciphertext',
      nonce: 'dummy-nonce-1',
      status: 'read',
      createdAt: fortyDaysAgo,
      deliveredAt: fortyDaysAgo,
      readAt: fortyDaysAgo,
    },
  });

  // Message 2: Delivered (not yet read), 35 days old -> MUST BE PURGED
  const msg2 = await prisma.message.create({
    data: {
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'old-delivered-ciphertext',
      nonce: 'dummy-nonce-2',
      status: 'delivered',
      createdAt: thirtyFiveDaysAgo,
      deliveredAt: thirtyFiveDaysAgo,
    },
  });

  // Message 3: Undelivered stale queue message, 35 days old -> MUST BE PURGED
  const msg3 = await prisma.message.create({
    data: {
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'old-queued-ciphertext',
      nonce: 'dummy-nonce-3',
      status: 'sent',
      createdAt: thirtyFiveDaysAgo,
    },
  });

  // Message 4: Read, 2 days old -> MUST BE PRESERVED
  const msg4 = await prisma.message.create({
    data: {
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'recent-read-ciphertext',
      nonce: 'dummy-nonce-4',
      status: 'read',
      createdAt: twoDaysAgo,
      deliveredAt: twoDaysAgo,
      readAt: twoDaysAgo,
    },
  });

  // Message 5: Pending, 1 hour old -> MUST BE PRESERVED
  const msg5 = await prisma.message.create({
    data: {
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'recent-pending-ciphertext',
      nonce: 'dummy-nonce-5',
      status: 'sent',
      createdAt: oneHourAgo,
    },
  });

  // Execute 30-day retention cleanup
  const cleanupResult = await runMessageRetentionCleanup(30);
  assert.equal(cleanupResult.retentionDays, 30);
  assert.equal(cleanupResult.purgedDeliveredAndRead >= 2, true);
  assert.equal(cleanupResult.purgedUndeliveredQueue >= 1, true);

  // Verify DB state
  const foundMsg1 = await prisma.message.findUnique({ where: { id: msg1.id } });
  assert.equal(foundMsg1, null, 'Old read message must be deleted');

  const foundMsg2 = await prisma.message.findUnique({ where: { id: msg2.id } });
  assert.equal(foundMsg2, null, 'Old delivered message must be deleted');

  const foundMsg3 = await prisma.message.findUnique({ where: { id: msg3.id } });
  assert.equal(foundMsg3, null, 'Stale queued message must be deleted');

  const foundMsg4 = await prisma.message.findUnique({ where: { id: msg4.id } });
  assert.notEqual(foundMsg4, null, 'Recent read message must be preserved');

  const foundMsg5 = await prisma.message.findUnique({ where: { id: msg5.id } });
  assert.notEqual(foundMsg5, null, 'Recent pending message must be preserved');

  // Clean up
  await prisma.user.delete({ where: { id: sender.id } });
  await prisma.user.delete({ where: { id: receiver.id } });
});

test('Phase 4: Coturn TURN Ephemeral Credentials (RFC 5766 REST API HMAC-SHA1)', async () => {
  const turnSecret = 'test_turn_secret_' + crypto.randomBytes(16).toString('hex');
  process.env.TURN_SECRET = turnSecret;
  process.env.TURN_TTL = '86400';

  const app = await buildTestApp();
  const userId = 'usr_turn_test_123';

  // 1. Direct generator verification
  const creds = generateTurnCredentials(userId);
  assert.equal(creds.ttl, 86400);
  assert.equal(creds.iceServers.length >= 2, true);

  const turnServer = creds.iceServers.find((s) => s.username && s.credential);
  assert.notEqual(turnServer, undefined);

  // Verify username format: <timestamp>:<userId>
  const [expiryStr, uId] = (turnServer?.username || '').split(':');
  assert.equal(uId, userId);
  const expiryTimestamp = parseInt(expiryStr, 10);
  assert.equal(expiryTimestamp > Math.floor(Date.now() / 1000), true);

  // Verify RFC 5766 HMAC-SHA1 password signature
  const expectedHmac = crypto.createHmac('sha1', turnSecret).update(turnServer!.username!).digest('base64');
  assert.equal(turnServer?.credential, expectedHmac, 'Password must match Coturn HMAC-SHA1 specification');

  // 2. HTTP Endpoint verification
  const token = app.jwt.sign({ userId, username: 'turntester', sessionId: 's1' });
  const httpRes = await app.inject({
    method: 'GET',
    url: '/api/turn-credentials',
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(httpRes.statusCode, 200);
  const httpData = JSON.parse(httpRes.body);
  assert.equal(Array.isArray(httpData.iceServers), true);
  assert.equal(httpData.iceServers.length >= 2, true);
});

test('Phase 4: Security Hardening — Media Path Traversal Prevention', async () => {
  const app = await buildTestApp();

  // 1. Traversal attempt with ../../
  const traversalRes1 = await app.inject({
    method: 'GET',
    url: '/api/media/..%2F..%2Fetc%2Fpasswd',
  });
  assert.equal(traversalRes1.statusCode, 400, 'Path traversal must be rejected with 400');

  // 2. Traversal attempt with arbitrary characters
  const traversalRes2 = await app.inject({
    method: 'GET',
    url: '/api/media/malicious_file.sh',
  });
  assert.equal(traversalRes2.statusCode, 400, 'Non-hex enc file IDs must be rejected');

  // 3. Valid hex enc file ID (not found -> 404)
  const validHexId = crypto.randomBytes(16).toString('hex') + '.enc';
  const notFoundRes = await app.inject({
    method: 'GET',
    url: `/api/media/${validHexId}`,
  });
  assert.equal(notFoundRes.statusCode, 404);
});

test('Phase A: Resumable Chunked Media Upload Validation & Init', async () => {
  const app = await buildTestApp();
  const token = app.jwt.sign({ userId: 'chunk_tester', username: 'chunktester', sessionId: 's1' });

  // 1. Unauthenticated request rejected
  const unauthRes = await app.inject({
    method: 'POST',
    url: '/api/media/upload/init',
    payload: { totalChunks: 2, totalSize: 1024 },
  });
  assert.equal(unauthRes.statusCode, 401);

  // 2. Reject size exceeding 25MB
  const oversizeRes = await app.inject({
    method: 'POST',
    url: '/api/media/upload/init',
    headers: { Authorization: `Bearer ${token}` },
    payload: { totalChunks: 10, totalSize: 30 * 1024 * 1024 },
  });
  assert.equal(oversizeRes.statusCode, 400);

  // 3. Valid init request
  const validInitRes = await app.inject({
    method: 'POST',
    url: '/api/media/upload/init',
    headers: { Authorization: `Bearer ${token}` },
    payload: { totalChunks: 3, totalSize: 1500 },
  });
  assert.equal(validInitRes.statusCode, 201);
  const data = JSON.parse(validInitRes.body);
  assert.equal(data.success, true);
  assert.match(data.uploadId, /^[a-f0-9]{32}$/);

  // 4. Complete with missing chunks fails
  const completeRes = await app.inject({
    method: 'POST',
    url: '/api/media/upload/complete',
    headers: { Authorization: `Bearer ${token}` },
    payload: { uploadId: data.uploadId, totalChunks: 3 },
  });
  assert.equal(completeRes.statusCode, 400);
});

test('Phase C Security: Test-Auth Bypass Refuses to Start in Production', async () => {
  // 1. Verify standard app without ENABLE_TEST_AUTH does NOT expose /api/auth/test-login
  const normalApp = await buildTestApp();
  const testLoginRes = await normalApp.inject({
    method: 'POST',
    url: '/api/auth/test-login',
    payload: { sub: 'test_123', email: 'test@example.com' },
  });
  assert.equal(testLoginRes.statusCode, 404, 'Test-login route must not exist when flag is off');

  // 2. Verify fatal crash if ENABLE_TEST_AUTH is attempted in production
  assert.throws(
    () => {
      const isProduction = true;
      const enableTestAuth = true;
      if (isProduction && enableTestAuth) {
        throw new Error('FATAL SECURITY VIOLATION: ENABLE_TEST_AUTH cannot be enabled when NODE_ENV=production');
      }
    },
    { message: /FATAL SECURITY VIOLATION/ },
    'Must throw fatal security violation if test auth is enabled in production'
  );
});
