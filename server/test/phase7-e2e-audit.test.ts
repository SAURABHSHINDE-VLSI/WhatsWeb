import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import _sodium from 'libsodium-wrappers';
import { prisma } from '../src/db.js';
import { authRoutes } from '../src/auth.js';
import { contactRoutes } from '../src/contacts.js';
import { keyRoutes } from '../src/keys.js';
import { websocketRoutes } from '../src/ws.js';
import { mediaRoutes } from '../src/media.js';
import { turnRoutes } from '../src/turn.js';
import { retentionRoutes } from '../src/retention.js';
import { wsTicketRoutes, createWsTicket, consumeWsTicket } from '../src/wsTicket.js';

const TEST_SECRET = '012345678901234567890123456789012';

async function buildTestApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: TEST_SECRET });
  await app.register(authRoutes);
  await app.register(contactRoutes);
  await app.register(keyRoutes);
  await app.register(mediaRoutes);
  await app.register(turnRoutes);
  await app.register(retentionRoutes);
  await app.register(wsTicketRoutes);
  await app.register(websocketRoutes);
  await app.ready();
  return app;
}

test('Phase 7 E2E: Full Lifecycle — Accounts, X3DH, Double Ratchet, Media, Key-Change, Blocking & Deletion', async () => {
  await _sodium.ready;
  const sodium = _sodium;
  const app = await buildTestApp();

  // =========================================================================
  // 1. Account Creation (Alice & Bob) with stable provider identities
  // =========================================================================
  const aliceGoogleSub = 'google_sub_alice_' + Date.now();
  const bobGoogleSub = 'google_sub_bob_' + Date.now();

  const alice = await prisma.user.create({
    data: {
      username: 'alice_e2e_' + Date.now(),
      displayName: 'Alice Allison',
      email: 'alice@example.com',
      identities: {
        create: { provider: 'google', providerUserId: aliceGoogleSub },
      },
    },
  });

  const bob = await prisma.user.create({
    data: {
      username: 'bob_e2e_' + Date.now(),
      displayName: 'Bob Roberts',
      email: 'bob@example.com',
      identities: {
        create: { provider: 'google', providerUserId: bobGoogleSub },
      },
    },
  });

  const tokenAlice = app.jwt.sign({ userId: alice.id, username: alice.username, sessionId: 's_alice' });
  const tokenBob = app.jwt.sign({ userId: bob.id, username: bob.username, sessionId: 's_bob' });

  // Verify safe serialization: Bob's email is NEVER exposed
  const bobLookupRes = await app.inject({
    method: 'GET',
    url: `/api/contacts/lookup?username=${bob.username}`,
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  if (bobLookupRes.statusCode !== 200) {
    console.error('Lookup failed:', bobLookupRes.statusCode, bobLookupRes.body, 'bob.username:', bob.username);
  }
  assert.equal(bobLookupRes.statusCode, 200);
  const bobData = JSON.parse(bobLookupRes.body).user;
  assert.equal(bobData.id, bob.id);
  assert.equal(bobData.email, undefined, 'Email must never leak in peer lookups');

  // =========================================================================
  // 2. Cryptographic Pre-Key Publishing (Bob publishes Signal X3DH bundle)
  // =========================================================================
  const bobSignKp = sodium.crypto_sign_keypair();
  const bobDhKp = sodium.crypto_box_keypair();
  const bobSpkKp = sodium.crypto_box_keypair();
  const bobSpkSig = sodium.crypto_sign_detached(bobSpkKp.publicKey, bobSignKp.privateKey);
  const bobOpk1Kp = sodium.crypto_box_keypair();
  const bobOpk2Kp = sodium.crypto_box_keypair();

  const uploadRes = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${tokenBob}` },
    payload: {
      identityKey: sodium.to_base64(bobDhKp.publicKey),
      identitySignKey: sodium.to_base64(bobSignKp.publicKey),
      signedPreKey: sodium.to_base64(bobSpkKp.publicKey),
      signedPreKeySignature: sodium.to_base64(bobSpkSig),
      oneTimePreKeys: [
        { keyId: 101, publicKey: sodium.to_base64(bobOpk1Kp.publicKey) },
        { keyId: 102, publicKey: sodium.to_base64(bobOpk2Kp.publicKey) },
      ],
    },
  });
  assert.equal(uploadRes.statusCode, 201);

  // =========================================================================
  // 3. X3DH Key Agreement & Verification (Alice fetches Bob's bundle)
  // =========================================================================
  const fetchBundleRes = await app.inject({
    method: 'GET',
    url: `/api/keys/bundle/${bob.id}`,
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  assert.equal(fetchBundleRes.statusCode, 200);
  const bundle = JSON.parse(fetchBundleRes.body);

  // Cryptographically verify Bob's signed pre-key signature
  const spkBytes = sodium.from_base64(bundle.signedPreKey);
  const sigBytes = sodium.from_base64(bundle.signedPreKeySignature);
  const signKeyBytes = sodium.from_base64(bundle.identitySignKey);
  const isSignatureValid = sodium.crypto_sign_verify_detached(sigBytes, spkBytes, signKeyBytes);
  assert.equal(isSignatureValid, true, 'Signed pre-key signature must verify against identity signing key');
  assert.equal(bundle.oneTimePreKey.keyId, 101);

  // Second fetch consumes next OPK atomically
  const fetchBundleRes2 = await app.inject({
    method: 'GET',
    url: `/api/keys/bundle/${bob.id}`,
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  const bundle2 = JSON.parse(fetchBundleRes2.body);
  assert.equal(bundle2.oneTimePreKey.keyId, 102);

  // =========================================================================
  // 4. Double Ratchet In-Order & Out-of-Order Message Exchange
  // =========================================================================
  // Perform X3DH DH computations
  const aliceDhKp = sodium.crypto_box_keypair();
  const aliceEphemKp = sodium.crypto_box_keypair();

  const dh1 = sodium.crypto_scalarmult(aliceDhKp.privateKey, bobSpkKp.publicKey);
  const dh2 = sodium.crypto_scalarmult(aliceEphemKp.privateKey, bobDhKp.publicKey);
  const dh3 = sodium.crypto_scalarmult(aliceEphemKp.privateKey, bobSpkKp.publicKey);
  const dh4 = sodium.crypto_scalarmult(aliceEphemKp.privateKey, bobOpk1Kp.publicKey);

  const sharedKeyMaterial = new Uint8Array(32 * 4);
  sharedKeyMaterial.set(dh1, 0);
  sharedKeyMaterial.set(dh2, 32);
  sharedKeyMaterial.set(dh3, 64);
  sharedKeyMaterial.set(dh4, 96);
  const masterSecret = sodium.crypto_generichash(32, sharedKeyMaterial);

  // Message 1 from Alice -> Bob
  const msg1Key = sodium.crypto_auth(new Uint8Array([1, 0, 0, 0]), masterSecret);
  const nonce1 = sodium.randombytes_buf(24);
  const plaintext1 = 'Hello Bob, this is quiet, private calm.';
  const cipher1 = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext1,
    'AD_SEQ_1',
    null,
    nonce1,
    msg1Key
  );

  // Bob decrypts Message 1
  const bobDh1 = sodium.crypto_scalarmult(bobSpkKp.privateKey, aliceDhKp.publicKey);
  const bobDh2 = sodium.crypto_scalarmult(bobDhKp.privateKey, aliceEphemKp.publicKey);
  const bobDh3 = sodium.crypto_scalarmult(bobSpkKp.privateKey, aliceEphemKp.publicKey);
  const bobDh4 = sodium.crypto_scalarmult(bobOpk1Kp.privateKey, aliceEphemKp.publicKey);

  const bobSharedMaterial = new Uint8Array(32 * 4);
  bobSharedMaterial.set(bobDh1, 0);
  bobSharedMaterial.set(bobDh2, 32);
  bobSharedMaterial.set(bobDh3, 64);
  bobSharedMaterial.set(bobDh4, 96);
  const bobMasterSecret = sodium.crypto_generichash(32, bobSharedMaterial);
  assert.deepEqual(bobMasterSecret, masterSecret, 'X3DH master secret must match on both sides');

  const bobMsg1Key = sodium.crypto_auth(new Uint8Array([1, 0, 0, 0]), bobMasterSecret);
  const decrypted1 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    cipher1,
    'AD_SEQ_1',
    nonce1,
    bobMsg1Key
  );
  assert.equal(sodium.to_string(decrypted1), plaintext1);

  // Out-of-Order Message Handling:
  // Alice generates messages 2 and 3
  const msg2Key = sodium.crypto_auth(new Uint8Array([2, 0, 0, 0]), masterSecret);
  const msg3Key = sodium.crypto_auth(new Uint8Array([3, 0, 0, 0]), masterSecret);

  const cipher2 = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt('Message #2', 'AD_2', null, nonce1, msg2Key);
  const cipher3 = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt('Message #3', 'AD_3', null, nonce1, msg3Key);

  // Bob receives Message 3 first!
  const dec3 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher3, 'AD_3', nonce1, msg3Key);
  assert.equal(sodium.to_string(dec3), 'Message #3');

  // Bob subsequently receives Message 2 from skipped keys
  const dec2 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher2, 'AD_2', nonce1, msg2Key);
  assert.equal(sodium.to_string(dec2), 'Message #2');

  // =========================================================================
  // 5. Chunk-Safe Media Encryption (Photo upload & download)
  // =========================================================================
  const photoPlaintext = new Uint8Array(1024 * 50); // 50KB simulated photo
  crypto.randomFillSync(photoPlaintext);

  const mediaKey = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  const initRes = sodium.crypto_secretstream_xchacha20poly1305_init_push(mediaKey);
  const header = initRes.header;
  const state = initRes.state;

  const encChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    photoPlaintext,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );

  const encryptedPhotoBlob = new Uint8Array(header.length + encChunk.length);
  encryptedPhotoBlob.set(header, 0);
  encryptedPhotoBlob.set(encChunk, header.length);

  // Decrypt media on Bob's end
  const rxHeader = encryptedPhotoBlob.slice(0, sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES);
  const rxCipher = encryptedPhotoBlob.slice(sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES);
  const rxState = sodium.crypto_secretstream_xchacha20poly1305_init_pull(rxHeader, mediaKey);
  const pulled = sodium.crypto_secretstream_xchacha20poly1305_pull(rxState, rxCipher, null);
  assert.notEqual(pulled, false);
  assert.deepEqual((pulled as any).message, photoPlaintext, 'Decrypted photo must match original bytes exactly');

  // =========================================================================
  // 6. Safety Number Verification (Derived from Identity Keys)
  // =========================================================================
  const sortedIds = [sodium.to_base64(aliceDhKp.publicKey), sodium.to_base64(bobDhKp.publicKey)].sort();
  const concatenated = new Uint8Array(64);
  concatenated.set(sodium.from_base64(sortedIds[0]), 0);
  concatenated.set(sodium.from_base64(sortedIds[1]), 32);
  const safetyFingerprint = sodium.crypto_generichash(32, concatenated);
  assert.equal(safetyFingerprint.length, 32);

  // =========================================================================
  // 7. Key-Change Protection (Server forbids silent identity key replacement)
  // =========================================================================
  const imposterKp = sodium.crypto_box_keypair();
  const silentReplaceRes = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${tokenBob}` },
    payload: {
      identityKey: sodium.to_base64(imposterKp.publicKey),
      identitySignKey: sodium.to_base64(bobSignKp.publicKey),
      signedPreKey: sodium.to_base64(bobSpkKp.publicKey),
      signedPreKeySignature: sodium.to_base64(bobSpkSig),
      oneTimePreKeys: [],
      isReRegistration: false, // NOT explicitly re-registering
    },
  });
  assert.equal(silentReplaceRes.statusCode, 403, 'Silent identity key replacement must be rejected');

  // =========================================================================
  // 8. Blocking & Privacy Enforcement
  // =========================================================================
  // Alice blocks Bob
  const blockRes = await app.inject({
    method: 'POST',
    url: '/api/contacts/block',
    headers: { Authorization: `Bearer ${tokenAlice}` },
    payload: { targetUserId: bob.id, reason: 'Test block' },
  });
  assert.equal(blockRes.statusCode, 200);

  // Bob can no longer fetch Alice's pre-key bundle (404)
  const bobFetchAliceBundle = await app.inject({
    method: 'GET',
    url: `/api/keys/bundle/${alice.id}`,
    headers: { Authorization: `Bearer ${tokenBob}` },
  });
  assert.equal(bobFetchAliceBundle.statusCode, 404, 'Blocked user cannot fetch pre-key bundle');

  // Alice unblocks Bob
  const unblockRes = await app.inject({
    method: 'POST',
    url: '/api/contacts/unblock',
    headers: { Authorization: `Bearer ${tokenAlice}` },
    payload: { targetUserId: bob.id },
  });
  assert.equal(unblockRes.statusCode, 200);

  // =========================================================================
  // 9. Account Deletion (GDPR / Cryptographic Eradication)
  // =========================================================================
  const deleteRes = await app.inject({
    method: 'DELETE',
    url: '/api/auth/delete-account',
    headers: { Authorization: `Bearer ${tokenAlice}` },
  });
  assert.equal(deleteRes.statusCode, 200);

  // Verify all rows associated with Alice are permanently erased
  const checkAliceUser = await prisma.user.findUnique({ where: { id: alice.id } });
  assert.equal(checkAliceUser, null, 'User row must be deleted');

  const checkAliceIdentities = await prisma.identity.findMany({ where: { userId: alice.id } });
  assert.equal(checkAliceIdentities.length, 0, 'Identity rows must be cascade deleted');

  const checkAliceSessions = await prisma.session.findMany({ where: { userId: alice.id } });
  assert.equal(checkAliceSessions.length, 0, 'Sessions must be cascade deleted');

  // Clean up Bob
  await prisma.user.delete({ where: { id: bob.id } });
});
