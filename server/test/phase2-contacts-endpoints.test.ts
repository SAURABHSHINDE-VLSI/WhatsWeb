import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import _sodium from 'libsodium-wrappers';
import { prisma } from '../src/db.js';
import { authRoutes } from '../src/auth.js';
import { contactRoutes } from '../src/contacts.js';
import { keyRoutes } from '../src/keys.js';

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: '012345678901234567890123456789012' });
  await app.register(authRoutes);
  await app.register(contactRoutes);
  await app.register(keyRoutes);
  await app.ready();
  return app;
}

test('Phase 2 Integration: Contact Requests, Lookups, Invites & Blocking', async () => {
  const app = await buildTestApp();

  // 1. Create two test users
  const user1 = await prisma.user.create({
    data: {
      username: 'alice_test_' + Date.now(),
      displayName: 'Alice Test',
      email: 'alice@example.com',
      identities: {
        create: { provider: 'google', providerUserId: 'sub-alice-' + Date.now() },
      },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      username: 'bob_test_' + Date.now(),
      displayName: 'Bob Test',
      email: 'bob@example.com',
      identities: {
        create: { provider: 'google', providerUserId: 'sub-bob-' + Date.now() },
      },
    },
  });

  const token1 = app.jwt.sign({ userId: user1.id, username: user1.username, sessionId: 's1' });
  const token2 = app.jwt.sign({ userId: user2.id, username: user2.username, sessionId: 's2' });

  // 2. Exact @username lookup
  const lookupRes = await app.inject({
    method: 'GET',
    url: `/api/users/lookup?username=${user2.username}`,
    headers: { Authorization: `Bearer ${token1}` },
  });

  assert.equal(lookupRes.statusCode, 200);
  const lookupBody = JSON.parse(lookupRes.body);
  assert.equal(lookupBody.user.id, user2.id);
  assert.equal(lookupBody.user.username, user2.username);
  assert.equal(lookupBody.user.email, undefined, 'Email must never be returned in lookup');
  assert.equal(lookupBody.isContact, false);

  // 3. Partial/Prefix lookup must fail (404)
  const partialRes = await app.inject({
    method: 'GET',
    url: `/api/users/lookup?username=${user2.username!.slice(0, 4)}`,
    headers: { Authorization: `Bearer ${token1}` },
  });
  assert.equal(partialRes.statusCode, 404);

  // 4. Send contact request: Alice -> Bob
  const reqRes = await app.inject({
    method: 'POST',
    url: '/api/contacts/request',
    headers: { Authorization: `Bearer ${token1}` },
    payload: { targetUserId: user2.id },
  });
  assert.equal(reqRes.statusCode, 201);
  const reqBody = JSON.parse(reqRes.body);
  assert.equal(reqBody.status, 'pending');

  // 5. Bob views incoming requests
  const bobInboxRes = await app.inject({
    method: 'GET',
    url: '/api/contacts/requests',
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert.equal(bobInboxRes.statusCode, 200);
  const bobInbox = JSON.parse(bobInboxRes.body);
  assert.equal(bobInbox.requests.length, 1);
  assert.equal(bobInbox.requests[0].sender.id, user1.id);
  assert.equal(bobInbox.requests[0].sender.email, undefined);

  // 6. Bob accepts Alice's request
  const acceptRes = await app.inject({
    method: 'POST',
    url: `/api/contacts/requests/${reqBody.id}/accept`,
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert.equal(acceptRes.statusCode, 200);

  // Verify mutual contact in DB
  const contact1 = await prisma.contact.findUnique({
    where: { userId_contactId: { userId: user1.id, contactId: user2.id } },
  });
  const contact2 = await prisma.contact.findUnique({
    where: { userId_contactId: { userId: user2.id, contactId: user1.id } },
  });
  assert.ok(contact1, 'Alice must have Bob in contacts');
  assert.ok(contact2, 'Bob must have Alice in contacts');

  // 7. Invite Link creation & resolution
  const inviteCreateRes = await app.inject({
    method: 'POST',
    url: '/api/invites',
    headers: { Authorization: `Bearer ${token1}` },
    payload: { expiresInDays: 7 },
  });
  assert.equal(inviteCreateRes.statusCode, 201);
  const inviteCode = JSON.parse(inviteCreateRes.body).code;
  assert.ok(inviteCode);

  const inviteResolveRes = await app.inject({
    method: 'GET',
    url: `/api/invites/${inviteCode}`,
  });
  assert.equal(inviteResolveRes.statusCode, 200);
  const inviterInfo = JSON.parse(inviteResolveRes.body).user;
  assert.equal(inviterInfo.id, user1.id);
  assert.equal(inviterInfo.email, undefined);

  // 8. Blocking stops Key Bundle fetches
  // First upload valid pre-key bundle for Alice
  await _sodium.ready;
  const sodium = _sodium;
  const signKp = sodium.crypto_sign_keypair();
  const dhKp = sodium.crypto_box_keypair();
  const spkKp = sodium.crypto_box_keypair();
  const spkSig = sodium.crypto_sign_detached(spkKp.publicKey, signKp.privateKey);
  const opkKp = sodium.crypto_box_keypair();

  const bundleUploadRes = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${token1}` },
    payload: {
      identityKey: sodium.to_base64(dhKp.publicKey),
      identitySignKey: sodium.to_base64(signKp.publicKey),
      signedPreKey: sodium.to_base64(spkKp.publicKey),
      signedPreKeySignature: sodium.to_base64(spkSig),
      oneTimePreKeys: [{ keyId: 1, publicKey: sodium.to_base64(opkKp.publicKey) }],
    },
  });
  assert.equal(bundleUploadRes.statusCode, 201);

  // Bob fetches Alice's bundle (should succeed)
  const bundleBeforeBlock = await app.inject({
    method: 'GET',
    url: `/api/keys/bundle/${user1.id}`,
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert.equal(bundleBeforeBlock.statusCode, 200);

  // Alice blocks Bob!
  const blockRes = await app.inject({
    method: 'POST',
    url: '/api/contacts/block',
    headers: { Authorization: `Bearer ${token1}` },
    payload: { targetUserId: user2.id, reason: 'Harassment test' },
  });
  assert.equal(blockRes.statusCode, 200);

  // Bob now tries to fetch Alice's bundle: MUST BE REJECTED (404)
  const bundleAfterBlock = await app.inject({
    method: 'GET',
    url: `/api/keys/bundle/${user1.id}`,
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert.equal(bundleAfterBlock.statusCode, 404, 'Blocked user cannot fetch key bundle');

  // Lookup of Alice by Bob must also 404
  const lookupAfterBlock = await app.inject({
    method: 'GET',
    url: `/api/users/lookup?username=${user1.username}`,
    headers: { Authorization: `Bearer ${token2}` },
  });
  assert.equal(lookupAfterBlock.statusCode, 404);

  // Cleanup
  await prisma.user.delete({ where: { id: user1.id } });
  await prisma.user.delete({ where: { id: user2.id } });
  await app.close();
});
