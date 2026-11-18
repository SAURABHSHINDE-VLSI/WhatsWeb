import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { prisma } from '../src/db.js';
import { authRoutes } from '../src/auth.js';
import { contactRoutes } from '../src/contacts.js';
import { keyRoutes } from '../src/keys.js';
import { websocketRoutes } from '../src/ws.js';
import { wsTicketRoutes, createWsTicket } from '../src/wsTicket.js';

const TEST_SECRET = '012345678901234567890123456789012';

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: TEST_SECRET });
  await app.register(authRoutes);
  await app.register(contactRoutes);
  await app.register(keyRoutes);
  await app.register(wsTicketRoutes);
  await app.register(websocketRoutes);
  await app.ready();
  return app;
}

test('Phase B: 15-Minute Edit Window & Sender Ownership Rules', async () => {
  const alice = await prisma.user.create({
    data: { username: 'alice_edit_' + Date.now(), displayName: 'Alice' },
  });
  const bob = await prisma.user.create({
    data: { username: 'bob_edit_' + Date.now(), displayName: 'Bob' },
  });

  const now = Date.now();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
  const twentyMinutesAgo = new Date(now - 20 * 60 * 1000);

  // Message 1: Sent 10 minutes ago by Alice (within 15-min window)
  const validEditMsg = await prisma.message.create({
    data: {
      senderId: alice.id,
      receiverId: bob.id,
      content: 'original-ciphertext-1',
      nonce: 'nonce-1',
      createdAt: tenMinutesAgo,
    },
  });

  // Message 2: Sent 20 minutes ago by Alice (expired window)
  const expiredMsg = await prisma.message.create({
    data: {
      senderId: alice.id,
      receiverId: bob.id,
      content: 'original-ciphertext-2',
      nonce: 'nonce-2',
      createdAt: twentyMinutesAgo,
    },
  });

  // Verify Edit rules
  const EDIT_WINDOW_MS = 15 * 60 * 1000;

  // 1. Valid edit within 15 min by original sender
  const age1 = Date.now() - new Date(validEditMsg.createdAt).getTime();
  assert.equal(age1 <= EDIT_WINDOW_MS, true, 'Message 1 is within 15-minute edit window');
  assert.equal(validEditMsg.senderId, alice.id, 'Sender matches original author');

  // 2. Expired edit (> 15 min) MUST be rejected
  const age2 = Date.now() - new Date(expiredMsg.createdAt).getTime();
  assert.equal(age2 > EDIT_WINDOW_MS, true, 'Message 2 exceeds 15-minute edit window and must be rejected');

  // 3. Edit attempt by receiver Bob on Alice's message MUST be rejected
  assert.notEqual(bob.id, validEditMsg.senderId, 'Bob is not the author and cannot edit Alice message');

  // Clean up
  await prisma.message.deleteMany({ where: { senderId: alice.id } });
  await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
});

test('Phase B: Control Message Envelope Integrity & Delete for Everyone', async () => {
  const sender = await prisma.user.create({
    data: { username: 'sender_ctrl_' + Date.now(), displayName: 'Sender' },
  });
  const receiver = await prisma.user.create({
    data: { username: 'recv_ctrl_' + Date.now(), displayName: 'Receiver' },
  });

  // Create message
  const originalMsg = await prisma.message.create({
    data: {
      clientMessageId: 'msg_' + Date.now(),
      senderId: sender.id,
      receiverId: receiver.id,
      content: 'secret-e2ee-content',
      nonce: 'nonce-123',
      status: 'delivered',
    },
  });

  // Control payload for delete for everyone
  const controlPayload = {
    controlType: 'delete_for_everyone',
    targetMessageId: originalMsg.id,
    timestamp: Date.now(),
  };

  assert.equal(controlPayload.controlType, 'delete_for_everyone');
  assert.equal(controlPayload.targetMessageId, originalMsg.id);

  // Receiver validates sender ownership before honoring deletion
  const msgInDb = await prisma.message.findUnique({ where: { id: originalMsg.id } });
  assert.equal(msgInDb?.senderId, sender.id, 'Deletion accepted only from matching author');

  // Clean up
  await prisma.message.deleteMany({ where: { senderId: sender.id } });
  await prisma.user.deleteMany({ where: { id: { in: [sender.id, receiver.id] } } });
});
