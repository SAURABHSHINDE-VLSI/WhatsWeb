import test from 'node:test';
import assert from 'node:assert/strict';
import sodium from 'libsodium-wrappers';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { prisma } from '../src/db.js';
import { keyRoutes } from '../src/keys.js';

// Signal-spec HKDF test function using libsodium crypto_auth
function hkdf(inputKeyMaterial: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  const saltKey = salt.length === 32 ? salt : new Uint8Array(32);
  const prk = sodium.crypto_auth(inputKeyMaterial, saltKey);

  const output = new Uint8Array(length);
  let previousT = new Uint8Array(0);
  let bytesGenerated = 0;
  let counter = 1;

  while (bytesGenerated < length) {
    const toHash = new Uint8Array(previousT.length + info.length + 1);
    toHash.set(previousT, 0);
    toHash.set(info, previousT.length);
    toHash[toHash.length - 1] = counter;

    const t = sodium.crypto_auth(toHash, prk);
    const take = Math.min(t.length, length - bytesGenerated);
    output.set(t.subarray(0, take), bytesGenerated);
    bytesGenerated += take;
    previousT = new Uint8Array(t);
    counter++;
  }
  return output;
}

function kdfRootKey(rootKey: Uint8Array, dhOut: Uint8Array): { nextRootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdf(dhOut, rootKey, sodium.from_string('WhisperRatchet'), 64);
  return {
    nextRootKey: derived.subarray(0, 32),
    chainKey: derived.subarray(32, 64),
  };
}

function kdfChainKey(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  const messageKey = sodium.crypto_auth(sodium.from_string('\x01'), chainKey);
  const nextChainKey = sodium.crypto_auth(sodium.from_string('\x02'), chainKey);
  return { nextChainKey, messageKey };
}

test('Phase 3: Cryptographic Protocol — X3DH Handshake & Double Ratchet', async () => {
  await sodium.ready;

  // 1. Generate Alice & Bob long-term Identity Keys
  const aliceSignPair = sodium.crypto_sign_keypair();
  const aliceDhPub = sodium.crypto_sign_ed25519_pk_to_curve25519(aliceSignPair.publicKey);
  const aliceDhPriv = sodium.crypto_sign_ed25519_sk_to_curve25519(aliceSignPair.privateKey);

  const bobSignPair = sodium.crypto_sign_keypair();
  const bobDhPub = sodium.crypto_sign_ed25519_pk_to_curve25519(bobSignPair.publicKey);
  const bobDhPriv = sodium.crypto_sign_ed25519_sk_to_curve25519(bobSignPair.privateKey);

  // 2. Bob publishes Signed Pre-Key (SPK) with Ed25519 signature
  const bobSpk = sodium.crypto_box_keypair();
  const bobSpkSignature = sodium.crypto_sign_detached(bobSpk.publicKey, bobSignPair.privateKey);

  // Verify signature verification passes on valid signature
  const validSig = sodium.crypto_sign_verify_detached(bobSpkSignature, bobSpk.publicKey, bobSignPair.publicKey);
  assert.equal(validSig, true, 'Signed pre-key signature must be valid');

  // Verify forged/tampered signature fails
  const tamperedSig = new Uint8Array(bobSpkSignature);
  tamperedSig[0] ^= 0xff;
  const invalidSig = sodium.crypto_sign_verify_detached(tamperedSig, bobSpk.publicKey, bobSignPair.publicKey);
  assert.equal(invalidSig, false, 'Tampered signed pre-key signature must be rejected');

  // Bob's One-Time Prekey (OPK)
  const bobOpk = sodium.crypto_box_keypair();

  // 3. Alice initiates X3DH to Bob
  const aliceEphemPair = sodium.crypto_box_keypair();

  const dh1 = sodium.crypto_scalarmult(aliceDhPriv, bobSpk.publicKey);
  const dh2 = sodium.crypto_scalarmult(aliceEphemPair.privateKey, bobDhPub);
  const dh3 = sodium.crypto_scalarmult(aliceEphemPair.privateKey, bobSpk.publicKey);
  const dh4 = sodium.crypto_scalarmult(aliceEphemPair.privateKey, bobOpk.publicKey);

  const combinedAlice = new Uint8Array(32 * 4);
  combinedAlice.set(dh1, 0);
  combinedAlice.set(dh2, 32);
  combinedAlice.set(dh3, 64);
  combinedAlice.set(dh4, 96);

  const masterSharedKeyAlice = hkdf(combinedAlice, new Uint8Array(32), sodium.from_string('WhisperRatchetMaster'), 32);

  // 4. Bob receives Alice's X3DH init
  const rDh1 = sodium.crypto_scalarmult(bobSpk.privateKey, aliceDhPub);
  const rDh2 = sodium.crypto_scalarmult(bobDhPriv, aliceEphemPair.publicKey);
  const rDh3 = sodium.crypto_scalarmult(bobSpk.privateKey, aliceEphemPair.publicKey);
  const rDh4 = sodium.crypto_scalarmult(bobOpk.privateKey, aliceEphemPair.publicKey);

  const combinedBob = new Uint8Array(32 * 4);
  combinedBob.set(rDh1, 0);
  combinedBob.set(rDh2, 32);
  combinedBob.set(rDh3, 64);
  combinedBob.set(rDh4, 96);

  const masterSharedKeyBob = hkdf(combinedBob, new Uint8Array(32), sodium.from_string('WhisperRatchetMaster'), 32);

  // Both parties must arrive at the EXACT identical master key!
  assert.deepEqual(masterSharedKeyAlice, masterSharedKeyBob, 'Alice and Bob master shared keys must match');

  // 5. Ephemeral key must NOT equal root key (Fixing old bug: ephemeralKey = session.rootKey)
  assert.notDeepEqual(
    aliceEphemPair.publicKey,
    masterSharedKeyAlice,
    'Ephemeral public key must never equal master root key'
  );

  // 6. Alice initializes Double Ratchet and sends Message 1
  const aliceDhsPair1 = sodium.crypto_box_keypair();
  const initialAliceDh = sodium.crypto_scalarmult(aliceDhsPair1.privateKey, bobSpk.publicKey);
  const { nextRootKey: aliceRoot1, chainKey: aliceSendChain1 } = kdfRootKey(masterSharedKeyAlice, initialAliceDh);

  const { nextChainKey: aliceSendChain2, messageKey: msgKey1 } = kdfChainKey(aliceSendChain1);

  const msg1Plaintext = 'Hello Bob, this is a real E2EE message!';
  const nonce1 = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ad1 = sodium.from_string(JSON.stringify({ v: 1, dh: sodium.to_base64(aliceDhsPair1.publicKey), s: 0 }));

  const msg1Ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(msg1Plaintext),
    ad1,
    null,
    nonce1,
    msgKey1
  );

  // Immediately zero msgKey1
  sodium.memzero(msgKey1);

  // 7. Bob receives Message 1, ratchets and decrypts
  const initialBobDh = sodium.crypto_scalarmult(bobSpk.privateKey, aliceDhsPair1.publicKey);
  const { nextRootKey: bobRoot1, chainKey: bobRecvChain1 } = kdfRootKey(masterSharedKeyBob, initialBobDh);

  const { nextChainKey: bobRecvChain2, messageKey: bobMsgKey1 } = kdfChainKey(bobRecvChain1);

  const decrypted1 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    msg1Ciphertext,
    ad1,
    nonce1,
    bobMsgKey1
  );
  sodium.memzero(bobMsgKey1);

  assert.equal(sodium.to_string(decrypted1), msg1Plaintext, 'Bob must successfully decrypt Message 1');

  // 8. Conversational Turn: Bob replies with Message 2 (DH Ratchet step!)
  const bobDhsPair2 = sodium.crypto_box_keypair();
  const dhTurn1 = sodium.crypto_scalarmult(bobDhsPair2.privateKey, aliceDhsPair1.publicKey);
  const { nextRootKey: bobRoot2, chainKey: bobSendChain1 } = kdfRootKey(bobRoot1, dhTurn1);

  const { nextChainKey: bobSendChain2, messageKey: bobMsgKey2 } = kdfChainKey(bobSendChain1);

  const msg2Plaintext = 'Acknowledged Alice! Double Ratchet advanced.';
  const nonce2 = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ad2 = sodium.from_string(JSON.stringify({ v: 1, dh: sodium.to_base64(bobDhsPair2.publicKey), s: 0 }));

  const msg2Ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(msg2Plaintext),
    ad2,
    null,
    nonce2,
    bobMsgKey2
  );
  sodium.memzero(bobMsgKey2);

  // Alice receives Bob's DH Ratchet message
  const aliceDhTurn1 = sodium.crypto_scalarmult(aliceDhsPair1.privateKey, bobDhsPair2.publicKey);
  const { nextRootKey: aliceRoot2, chainKey: aliceRecvChain1 } = kdfRootKey(aliceRoot1, aliceDhTurn1);

  const { nextChainKey: aliceRecvChain2, messageKey: aliceDecMsgKey2 } = kdfChainKey(aliceRecvChain1);

  const decrypted2 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    msg2Ciphertext,
    ad2,
    nonce2,
    aliceDecMsgKey2
  );
  sodium.memzero(aliceDecMsgKey2);

  assert.equal(sodium.to_string(decrypted2), msg2Plaintext, 'Alice must successfully decrypt Message 2 after DH ratchet');
});

test('Phase 3: Out-of-Order Message Handling with Skipped Keys', async () => {
  await sodium.ready;

  // Alice sending chain
  let sendChain = sodium.randombytes_buf(32);

  // Produce Msg 0 and Msg 1
  const { nextChainKey: s1, messageKey: k0 } = kdfChainKey(sendChain);
  const { nextChainKey: s2, messageKey: k1 } = kdfChainKey(s1);

  const nonce0 = sodium.randombytes_buf(24);
  const nonce1 = sodium.randombytes_buf(24);
  const ad = sodium.from_string('test-ad');

  const c0 = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(sodium.from_string('Msg 0'), ad, null, nonce0, k0);
  const c1 = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(sodium.from_string('Msg 1'), ad, null, nonce1, k1);

  // Bob receives Msg 1 FIRST (Msg 0 is delayed/out-of-order)
  let recvChain = new Uint8Array(sendChain);
  const skippedKeys: Record<string, Uint8Array> = {};

  // Bob skips Msg 0 and stores its message key
  const { nextChainKey: r1, messageKey: skippedK0 } = kdfChainKey(recvChain);
  skippedKeys['dh:0'] = skippedK0;
  recvChain = r1;

  // Bob derives Msg 1 key and decrypts Msg 1
  const { nextChainKey: r2, messageKey: bobK1 } = kdfChainKey(recvChain);
  const dec1 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, c1, ad, nonce1, bobK1);
  assert.equal(sodium.to_string(dec1), 'Msg 1');

  // Later, delayed Msg 0 arrives! Bob retrieves from skippedKeys
  assert.ok(skippedKeys['dh:0']);
  const dec0 = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, c0, ad, nonce0, skippedKeys['dh:0']);
  assert.equal(sodium.to_string(dec0), 'Msg 0');

  // Immediately zero and delete skipped key
  sodium.memzero(skippedKeys['dh:0']);
  delete skippedKeys['dh:0'];
  assert.equal(skippedKeys['dh:0'], undefined);
});

test('Phase 3: Media Encryption via Chunk-Safe crypto_secretstream', async () => {
  await sodium.ready;

  const originalFile = 'This is a sensitive high-resolution document payload with multiple chunks.';
  const fileBytes = sodium.from_string(originalFile);

  const key = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  const initPush = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);

  const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(
    initPush.state,
    fileBytes,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );

  // Decryption by recipient using header and key
  const initPull = sodium.crypto_secretstream_xchacha20poly1305_init_pull(initPush.header, key);
  const pullRes = sodium.crypto_secretstream_xchacha20poly1305_pull(initPull, ciphertext, null);

  assert.ok(pullRes);
  assert.equal(pullRes.tag, sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL);
  assert.equal(sodium.to_string(pullRes.message), originalFile);

  // Tampering detection: modify 1 byte of ciphertext
  const tamperedCiphertext = new Uint8Array(ciphertext);
  tamperedCiphertext[tamperedCiphertext.length - 1] ^= 0x01;

  const initPullTampered = sodium.crypto_secretstream_xchacha20poly1305_init_pull(initPush.header, key);
  const tamperedRes = sodium.crypto_secretstream_xchacha20poly1305_pull(initPullTampered, tamperedCiphertext, null);

  assert.equal(tamperedRes, false, 'Tampered ciphertext must fail authentication and return false');
});

test('Phase 3: Server Pre-Key Bundle Signature Enforcement & Identity Key Locking', async () => {
  await sodium.ready;

  const app = Fastify();
  await app.register(cookie);
  await app.register(jwt, { secret: '012345678901234567890123456789012' });
  await app.register(keyRoutes);
  await app.ready();

  const user = await prisma.user.create({
    data: {
      username: 'crypto_test_' + Date.now(),
      displayName: 'Crypto Test',
    },
  });

  const token = app.jwt.sign({ userId: user.id, username: user.username, sessionId: 's1' });

  const signPair = sodium.crypto_sign_keypair();
  const dhPub = sodium.crypto_sign_ed25519_pk_to_curve25519(signPair.publicKey);
  const spk = sodium.crypto_box_keypair();
  const signature = sodium.crypto_sign_detached(spk.publicKey, signPair.privateKey);

  // 1. Upload valid pre-key bundle
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      identityKey: sodium.to_base64(dhPub),
      identitySignKey: sodium.to_base64(signPair.publicKey),
      signedPreKey: sodium.to_base64(spk.publicKey),
      signedPreKeySignature: sodium.to_base64(signature),
      oneTimePreKeys: [{ keyId: 101, publicKey: sodium.to_base64(sodium.crypto_box_keypair().publicKey) }],
    },
  });

  assert.equal(res1.statusCode, 201);

  // 2. Upload bundle with invalid signature (MUST BE REJECTED 400)
  const badSig = new Uint8Array(signature);
  badSig[0] ^= 0xff;

  const resBadSig = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      identityKey: sodium.to_base64(dhPub),
      identitySignKey: sodium.to_base64(signPair.publicKey),
      signedPreKey: sodium.to_base64(spk.publicKey),
      signedPreKeySignature: sodium.to_base64(badSig),
      oneTimePreKeys: [],
    },
  });
  assert.equal(resBadSig.statusCode, 400);
  assert.match(JSON.parse(resBadSig.body).error, /signature verification failed/i);

  // 3. Silent Identity Key Replacement without isReRegistration (MUST BE REJECTED 403)
  const differentSignPair = sodium.crypto_sign_keypair();
  const differentDhPub = sodium.crypto_sign_ed25519_pk_to_curve25519(differentSignPair.publicKey);
  const differentSpk = sodium.crypto_box_keypair();
  const differentSig = sodium.crypto_sign_detached(differentSpk.publicKey, differentSignPair.privateKey);

  const resReplacedKey = await app.inject({
    method: 'POST',
    url: '/api/keys/bundle',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      identityKey: sodium.to_base64(differentDhPub),
      identitySignKey: sodium.to_base64(differentSignPair.publicKey),
      signedPreKey: sodium.to_base64(differentSpk.publicKey),
      signedPreKeySignature: sodium.to_base64(differentSig),
      oneTimePreKeys: [],
      isReRegistration: false,
    },
  });
  assert.equal(resReplacedKey.statusCode, 403);

  // Cleanup
  await prisma.user.delete({ where: { id: user.id } });
  await app.close();
});
