import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { prisma } from '../src/db.js';
import { backupRoutes } from '../src/backup.js';
import { passkeyRoutes } from '../src/passkey.js';
import { runMessageRetentionCleanup } from '../src/retention.js';

const TEST_SECRET = '012345678901234567890123456789012';

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: TEST_SECRET });
  await app.register(backupRoutes);
  await app.register(passkeyRoutes);
  await app.ready();
  return app;
}

test('Phase D: Disappearing Messages Server-Side Expiration Retention Purge', async () => {
  const userA = await prisma.user.create({
    data: { username: 'alice_disappear_' + Date.now(), displayName: 'Alice' },
  });
  const userB = await prisma.user.create({
    data: { username: 'bob_disappear_' + Date.now(), displayName: 'Bob' },
  });

  const now = Date.now();
  const expiredTime = new Date(now - 60 * 1000); // 1 minute in the past
  const futureTime = new Date(now + 24 * 60 * 60 * 1000); // 24 hours in the future

  // Message 1: Expired disappearing message (undelivered/unread)
  const expiredMsg = await prisma.message.create({
    data: {
      senderId: userA.id,
      receiverId: userB.id,
      content: 'ciphertext_expired',
      nonce: 'nonce_expired',
      type: 'text',
      status: 'sent',
      expiresAt: expiredTime,
    },
  });

  // Message 2: Active disappearing message (should NOT be purged)
  const activeMsg = await prisma.message.create({
    data: {
      senderId: userA.id,
      receiverId: userB.id,
      content: 'ciphertext_active',
      nonce: 'nonce_active',
      type: 'text',
      status: 'sent',
      expiresAt: futureTime,
    },
  });

  // Trigger retention purge
  const cleanupResult = await runMessageRetentionCleanup();
  assert.ok(cleanupResult.purgedDisappearing && cleanupResult.purgedDisappearing >= 1, 'Should purge at least 1 disappearing message');

  // Verify expired message was purged from database
  const checkExpired = await prisma.message.findUnique({ where: { id: expiredMsg.id } });
  assert.strictEqual(checkExpired, null, 'Expired disappearing message must be deleted');

  // Verify future message remains intact
  const checkActive = await prisma.message.findUnique({ where: { id: activeMsg.id } });
  assert.ok(checkActive, 'Future disappearing message must not be deleted');

  // Clean up
  await prisma.message.deleteMany({ where: { id: { in: [activeMsg.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
});

test('Phase D: End-to-End Encrypted Cloud Backup & Restore API (Argon2id Payload)', async () => {
  const app = await buildTestApp();

  const user = await prisma.user.create({
    data: { username: 'user_backup_' + Date.now(), displayName: 'Backup User' },
  });

  const token = app.jwt.sign({ userId: user.id });

  // 1. Initial GET - should be null
  const getRes1 = await app.inject({
    method: 'GET',
    url: '/api/backup',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(getRes1.statusCode, 200);
  assert.strictEqual(JSON.parse(getRes1.body).backup, null);

  // 2. Upload Encrypted Backup
  const fakeCiphertext = Buffer.from('encrypted_backup_data_bundle').toString('base64');
  const fakeSalt = Buffer.from('argon2id_random_salt_16b').toString('base64');
  const fakeNonce = Buffer.from('xchacha20_nonce_24b').toString('base64');

  const uploadRes = await app.inject({
    method: 'POST',
    url: '/api/backup',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      backupCiphertext: fakeCiphertext,
      salt: fakeSalt,
      nonce: fakeNonce,
      version: 1,
    },
  });
  assert.strictEqual(uploadRes.statusCode, 200);
  const uploadBody = JSON.parse(uploadRes.body);
  assert.strictEqual(uploadBody.success, true);
  assert.strictEqual(uploadBody.version, 1);
  assert.ok(uploadBody.sizeBytes > 0);

  // 3. GET Backup - verify ciphertext, salt, and nonce match exactly
  const getRes2 = await app.inject({
    method: 'GET',
    url: '/api/backup',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(getRes2.statusCode, 200);
  const getBody2 = JSON.parse(getRes2.body);
  assert.ok(getBody2.backup);
  assert.strictEqual(getBody2.backup.backupCiphertext, fakeCiphertext);
  assert.strictEqual(getBody2.backup.salt, fakeSalt);
  assert.strictEqual(getBody2.backup.nonce, fakeNonce);

  // 4. DELETE Backup
  const deleteRes = await app.inject({
    method: 'DELETE',
    url: '/api/backup',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(deleteRes.statusCode, 200);

  // 5. Verify Backup is gone
  const getRes3 = await app.inject({
    method: 'GET',
    url: '/api/backup',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(getRes3.statusCode, 200);
  assert.strictEqual(JSON.parse(getRes3.body).backup, null);

  // Clean up
  await prisma.user.delete({ where: { id: user.id } });
});

test('Phase D: WebAuthn Passkeys Registration & Assertion Lifecycle', async () => {
  const app = await buildTestApp();

  const user = await prisma.user.create({
    data: { username: 'user_passkey_' + Date.now(), displayName: 'Passkey User' },
  });

  const token = app.jwt.sign({ userId: user.id });

  // 1. Request Register Options
  const regOptRes = await app.inject({
    method: 'POST',
    url: '/api/auth/passkey/register-options',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(regOptRes.statusCode, 200);
  const regOpts = JSON.parse(regOptRes.body);
  assert.ok(regOpts.challenge);
  assert.strictEqual(regOpts.user.name, user.username);

  // 2. Verify and Save Passkey Credential
  const testCredId = Buffer.from('test_cred_id_' + Date.now()).toString('base64url');
  const testPubKey = Buffer.from('test_public_key_bytes').toString('base64url');

  const regVerifyRes = await app.inject({
    method: 'POST',
    url: '/api/auth/passkey/register-verify',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      challenge: regOpts.challenge,
      credentialId: testCredId,
      publicKey: testPubKey,
      deviceName: 'MacBook Pro Touch ID',
    },
  });
  assert.strictEqual(regVerifyRes.statusCode, 200);
  assert.strictEqual(JSON.parse(regVerifyRes.body).success, true);

  // 3. List Registered Credentials
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/auth/passkey/credentials',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(listRes.statusCode, 200);
  const listBody = JSON.parse(listRes.body);
  assert.strictEqual(listBody.credentials.length, 1);
  assert.strictEqual(listBody.credentials[0].credentialId, testCredId);
  assert.strictEqual(listBody.credentials[0].deviceName, 'MacBook Pro Touch ID');

  // 4. Request Login Options (Unauthenticated)
  const loginOptRes = await app.inject({
    method: 'POST',
    url: '/api/auth/passkey/login-options',
    payload: { username: user.username },
  });
  assert.strictEqual(loginOptRes.statusCode, 200);
  const loginOpts = JSON.parse(loginOptRes.body);
  assert.ok(loginOpts.challenge);
  assert.strictEqual(loginOpts.allowCredentials.length, 1);
  assert.strictEqual(loginOpts.allowCredentials[0].id, testCredId);

  // 5. Verify Login (Assertion)
  const loginVerifyRes = await app.inject({
    method: 'POST',
    url: '/api/auth/passkey/login-verify',
    payload: {
      challenge: loginOpts.challenge,
      credentialId: testCredId,
      authenticatorData: 'test_auth_data',
      clientDataJSON: 'test_client_data',
      signature: 'test_signature',
    },
  });
  assert.strictEqual(loginVerifyRes.statusCode, 200);
  const loginVerifyBody = JSON.parse(loginVerifyRes.body);
  assert.ok(loginVerifyBody.accessToken);
  assert.strictEqual(loginVerifyBody.user.id, user.id);

  // 6. Delete Passkey
  const credRecordId = listBody.credentials[0].id;
  const deleteRes = await app.inject({
    method: 'DELETE',
    url: `/api/auth/passkey/credentials/${credRecordId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(deleteRes.statusCode, 200);

  // 7. List again - should be empty
  const listRes2 = await app.inject({
    method: 'GET',
    url: '/api/auth/passkey/credentials',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(JSON.parse(listRes2.body).credentials.length, 0);

  // Clean up
  await prisma.user.delete({ where: { id: user.id } });
});
