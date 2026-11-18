import sodium from 'libsodium-wrappers';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface IdentityKeyPair {
  signPublicKey: string; // Ed25519 Base64
  signPrivateKey: string; // Ed25519 Base64
  dhPublicKey: string; // X25519 Base64
  dhPrivateKey: string; // X25519 Base64
}

export interface SignedPreKeyPair {
  publicKey: string; // X25519 Base64
  privateKey: string; // X25519 Base64
  signature: string; // Ed25519 signature Base64
  createdAt: number;
}

export interface OneTimePreKeyPair {
  keyId: number;
  publicKey: string; // X25519 Base64
  privateKey: string; // X25519 Base64
}

export interface SessionState {
  partnerId: string;
  partnerIdentityKey: string; // X25519 Base64
  rootKey: string; // 32-byte Base64
  sendChainKey: string; // 32-byte Base64
  recvChainKey: string; // 32-byte Base64
  sendSequence: number;
  recvSequence: number;
  skippedKeys: Record<string, string>; // "sequence": messageKeyBase64 (for out-of-order)
  verifiedSafetyNumber?: boolean;
}

interface CryptoKeyStoreDB extends DBSchema {
  identity: {
    key: string;
    value: IdentityKeyPair;
  };
  signed_prekeys: {
    key: string;
    value: SignedPreKeyPair;
  };
  one_time_prekeys: {
    key: number;
    value: OneTimePreKeyPair;
  };
  sessions: {
    key: string;
    value: SessionState;
  };
  verified_fingerprints: {
    key: string;
    value: { partnerId: string; fingerprint: string; verifiedAt: string };
  };
}

let cryptoDbPromise: Promise<IDBPDatabase<CryptoKeyStoreDB>> | null = null;

async function getCryptoDB(): Promise<IDBPDatabase<CryptoKeyStoreDB>> {
  if (!cryptoDbPromise) {
    cryptoDbPromise = openDB<CryptoKeyStoreDB>('editorial_crypto_keystore_v1', 1, {
      upgrade(db) {
        db.createObjectStore('identity');
        db.createObjectStore('signed_prekeys');
        db.createObjectStore('one_time_prekeys', { keyPath: 'keyId' });
        db.createObjectStore('sessions', { keyPath: 'partnerId' });
        db.createObjectStore('verified_fingerprints', { keyPath: 'partnerId' });
      },
    });
  }
  return cryptoDbPromise;
}

export async function initCrypto(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

/**
 * Generate long-term Ed25519 Identity Key and convert to X25519 for DH
 */
export async function getOrCreateIdentityKey(): Promise<IdentityKeyPair> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('identity', 'current');
  if (existing) return existing;

  // Generate Ed25519 keypair for signing
  const signPair = sodium.crypto_sign_keypair();
  // Derive X25519 keypair for Diffie-Hellman key exchange
  const dhPub = sodium.crypto_sign_ed25519_pk_to_curve25519(signPair.publicKey);
  const dhSec = sodium.crypto_sign_ed25519_sk_to_curve25519(signPair.privateKey);

  const keyPair: IdentityKeyPair = {
    signPublicKey: sodium.to_base64(signPair.publicKey),
    signPrivateKey: sodium.to_base64(signPair.privateKey),
    dhPublicKey: sodium.to_base64(dhPub),
    dhPrivateKey: sodium.to_base64(dhSec),
  };

  await db.put('identity', keyPair, 'current');
  return keyPair;
}

/**
 * Generate Signed Pre-Key signed by Identity Key
 */
export async function getOrCreateSignedPreKey(identity: IdentityKeyPair): Promise<SignedPreKeyPair> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('signed_prekeys', 'current');
  if (existing) return existing;

  const spkPair = sodium.crypto_box_keypair();
  const signPriv = sodium.from_base64(identity.signPrivateKey);
  const signature = sodium.crypto_sign_detached(spkPair.publicKey, signPriv);

  const spk: SignedPreKeyPair = {
    publicKey: sodium.to_base64(spkPair.publicKey),
    privateKey: sodium.to_base64(spkPair.privateKey),
    signature: sodium.to_base64(signature),
    createdAt: Date.now(),
  };

  await db.put('signed_prekeys', spk, 'current');
  return spk;
}

/**
 * Generate a batch of One-Time Pre-Keys (OPKs)
 */
export async function generateOneTimePreKeys(count = 20): Promise<OneTimePreKeyPair[]> {
  await sodium.ready;
  const db = await getCryptoDB();
  const keys: OneTimePreKeyPair[] = [];

  for (let i = 0; i < count; i++) {
    const pair = sodium.crypto_box_keypair();
    const item: OneTimePreKeyPair = {
      keyId: Math.floor(Math.random() * 10000000),
      publicKey: sodium.to_base64(pair.publicKey),
      privateKey: sodium.to_base64(pair.privateKey),
    };
    keys.push(item);
    await db.put('one_time_prekeys', item);
  }

  return keys;
}

/**
 * Compute Signal-standard Safety Number formatted as 12 groups of 5 digits
 */
export async function computeSafetyNumber(myIdentityKeyBase64: string, partnerIdentityKeyBase64: string): Promise<string> {
  await sodium.ready;
  const myKey = sodium.from_base64(myIdentityKeyBase64);
  const theirKey = sodium.from_base64(partnerIdentityKeyBase64);

  // Lexicographical ordering so both parties arrive at the identical safety number
  const cmp = sodium.compare(myKey, theirKey);
  const combined = new Uint8Array(64);
  if (cmp <= 0) {
    combined.set(myKey, 0);
    combined.set(theirKey, 32);
  } else {
    combined.set(theirKey, 0);
    combined.set(myKey, 32);
  }

  // SHA-512 hash (64 bytes)
  const hash = sodium.crypto_hash(combined);
  const digits: string[] = [];

  for (let i = 0; i < 12; i++) {
    // Take 4 bytes per chunk and map to 5 digits (00000 - 99999)
    const offset = i * 4;
    const val =
      ((hash[offset] << 24) |
        (hash[offset + 1] << 16) |
        (hash[offset + 2] << 8) |
        hash[offset + 3]) >>>
      0;
    const formatted = String(val % 100000).padStart(5, '0');
    digits.push(formatted);
  }

  return digits.join(' ');
}

/**
 * Derive session keys from Diffie-Hellman secret using KDF
 */
function deriveSessionKeys(dhSecret: Uint8Array): {
  rootKey: Uint8Array;
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
} {
  const rootKey = sodium.crypto_generichash(32, dhSecret, sodium.from_string('root-salt'));
  const sendChainKey = sodium.crypto_generichash(32, rootKey, sodium.from_string('send-chain'));
  const recvChainKey = sodium.crypto_generichash(32, rootKey, sodium.from_string('recv-chain'));

  return { rootKey, sendChainKey, recvChainKey };
}

/**
 * Advance chain key (symmetric ratchet) and produce message key
 */
function ratchetStep(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  const nextChainKey = sodium.crypto_generichash(32, chainKey, sodium.from_string('next-chain'));
  const messageKey = sodium.crypto_generichash(32, chainKey, sodium.from_string('msg-key'));
  return { nextChainKey, messageKey };
}

/**
 * Establish E2EE Session with recipient using X3DH-style key agreement
 */
export async function getOrCreateSession(
  partnerId: string,
  partnerKeyBundle?: {
    identityKey: string;
    signedPreKey: string;
    signedPreKeySignature?: string;
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
  }
): Promise<SessionState> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('sessions', partnerId);
  if (existing) return existing;

  if (!partnerKeyBundle) {
    throw new Error(`No existing session and no key bundle provided for ${partnerId}`);
  }

  const identity = await getOrCreateIdentityKey();
  const myDhPriv = sodium.from_base64(identity.dhPrivateKey);

  const theirDhPub = sodium.from_base64(partnerKeyBundle.identityKey);
  const theirSpkPub = sodium.from_base64(partnerKeyBundle.signedPreKey);

  // Generate ephemeral key for X3DH
  const ephemPair = sodium.crypto_box_keypair();

  // DH1 = myIdentityPriv * theirSpkPub
  const dh1 = sodium.crypto_scalarmult(myDhPriv, theirSpkPub);
  // DH2 = myEphemPriv * theirIdentityPub
  const dh2 = sodium.crypto_scalarmult(ephemPair.privateKey, theirDhPub);
  // DH3 = myEphemPriv * theirSpkPub
  const dh3 = sodium.crypto_scalarmult(ephemPair.privateKey, theirSpkPub);

  // Optional DH4 with One-Time Prekey
  let totalLen = 32 * 3;
  let dh4: Uint8Array | null = null;
  if (partnerKeyBundle.oneTimePreKey) {
    const theirOpkPub = sodium.from_base64(partnerKeyBundle.oneTimePreKey.publicKey);
    dh4 = sodium.crypto_scalarmult(ephemPair.privateKey, theirOpkPub);
    totalLen += 32;
  }

  const combined = new Uint8Array(totalLen);
  combined.set(dh1, 0);
  combined.set(dh2, 32);
  combined.set(dh3, 64);
  if (dh4) combined.set(dh4, 96);

  const { rootKey, sendChainKey, recvChainKey } = deriveSessionKeys(combined);

  const session: SessionState = {
    partnerId,
    partnerIdentityKey: partnerKeyBundle.identityKey,
    rootKey: sodium.to_base64(rootKey),
    sendChainKey: sodium.to_base64(sendChainKey),
    recvChainKey: sodium.to_base64(recvChainKey),
    sendSequence: 0,
    recvSequence: 0,
    skippedKeys: {},
  };

  await db.put('sessions', session);
  return session;
}

/**
 * Handle incoming X3DH session initiation on receiver side
 */
export async function initializeReceivingSession(
  partnerId: string,
  partnerIdentityKey: string,
  ephemeralKeyBase64: string,
  opkId?: number | null
): Promise<SessionState> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('sessions', partnerId);
  if (existing) return existing;

  const identity = await getOrCreateIdentityKey();
  const spk = await getOrCreateSignedPreKey(identity);

  const theirIdentityPub = sodium.from_base64(partnerIdentityKey);
  const theirEphemPub = sodium.from_base64(ephemeralKeyBase64);

  const mySpkPriv = sodium.from_base64(spk.privateKey);
  const myIdentityDhPriv = sodium.from_base64(identity.dhPrivateKey);

  // DH1 = mySpkPriv * theirIdentityPub
  const dh1 = sodium.crypto_scalarmult(mySpkPriv, theirIdentityPub);
  // DH2 = myIdentityDhPriv * theirEphemPub
  const dh2 = sodium.crypto_scalarmult(myIdentityDhPriv, theirEphemPub);
  // DH3 = mySpkPriv * theirEphemPub
  const dh3 = sodium.crypto_scalarmult(mySpkPriv, theirEphemPub);

  let totalLen = 32 * 3;
  let dh4: Uint8Array | null = null;

  if (typeof opkId === 'number') {
    const opk = await db.get('one_time_prekeys', opkId);
    if (opk) {
      const opkPriv = sodium.from_base64(opk.privateKey);
      dh4 = sodium.crypto_scalarmult(opkPriv, theirEphemPub);
      totalLen += 32;
      // Delete used OPK
      await db.delete('one_time_prekeys', opkId);
    }
  }

  const combined = new Uint8Array(totalLen);
  combined.set(dh1, 0);
  combined.set(dh2, 32);
  combined.set(dh3, 64);
  if (dh4) combined.set(dh4, 96);

  // Note: On receiver side, sendChain and recvChain are swapped!
  const { rootKey, sendChainKey, recvChainKey } = deriveSessionKeys(combined);

  const session: SessionState = {
    partnerId,
    partnerIdentityKey,
    rootKey: sodium.to_base64(rootKey),
    sendChainKey: sodium.to_base64(recvChainKey), // swapped for bidirectional ratchet
    recvChainKey: sodium.to_base64(sendChainKey), // swapped
    sendSequence: 0,
    recvSequence: 0,
    skippedKeys: {},
  };

  await db.put('sessions', session);
  return session;
}

/**
 * Encrypt message payload using XChaCha20-Poly1305 with AEAD authentication
 */
export async function encryptMessage(
  partnerId: string,
  plaintext: string,
  metadata: { senderId: string; receiverId: string; timestamp: string }
): Promise<{
  ciphertext: string; // Base64
  nonce: string; // 24-byte Base64
  sequence: number;
}> {
  await sodium.ready;
  const db = await getCryptoDB();
  const session = await db.get('sessions', partnerId);
  if (!session) {
    throw new Error(`No active E2EE session for ${partnerId}`);
  }

  const sendChain = sodium.from_base64(session.sendChainKey);
  const { nextChainKey, messageKey } = ratchetStep(sendChain);

  // Random 24-byte nonce per message for XChaCha20-Poly1305
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  // Authenticated Data (AD) binds sender, recipient, timestamp and sequence number
  const ad = sodium.from_string(
    JSON.stringify({
      s: metadata.senderId,
      r: metadata.receiverId,
      t: metadata.timestamp,
      seq: session.sendSequence,
    })
  );

  const plaintextBytes = sodium.from_string(plaintext);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    ad,
    null,
    nonce,
    messageKey
  );

  // Update session state
  session.sendChainKey = sodium.to_base64(nextChainKey);
  const currentSeq = session.sendSequence;
  session.sendSequence++;
  await db.put('sessions', session);

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
    sequence: currentSeq,
  };
}

/**
 * Decrypt message payload using XChaCha20-Poly1305 with AEAD authentication
 */
export async function decryptMessage(
  partnerId: string,
  ciphertextBase64: string,
  nonceBase64: string,
  metadata: { senderId: string; receiverId: string; timestamp: string; sequence?: number }
): Promise<string> {
  await sodium.ready;
  const db = await getCryptoDB();
  const session = await db.get('sessions', partnerId);
  if (!session) {
    throw new Error(`No active E2EE session for ${partnerId}`);
  }

  const nonce = sodium.from_base64(nonceBase64);
  const ciphertext = sodium.from_base64(ciphertextBase64);

  const recvChain = sodium.from_base64(session.recvChainKey);
  const { nextChainKey, messageKey } = ratchetStep(recvChain);

  const seq = metadata.sequence !== undefined ? metadata.sequence : session.recvSequence;
  const ad = sodium.from_string(
    JSON.stringify({
      s: metadata.senderId,
      r: metadata.receiverId,
      t: metadata.timestamp,
      seq,
    })
  );

  try {
    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      ad,
      nonce,
      messageKey
    );

    session.recvChainKey = sodium.to_base64(nextChainKey);
    session.recvSequence++;
    await db.put('sessions', session);

    return sodium.to_string(decrypted);
  } catch (err) {
    // If decryption fails due to tampering or wrong key
    throw new Error('Message authentication failed: ciphertext or metadata was modified in transit.');
  }
}

/**
 * Check if contact identity key matches stored fingerprint
 */
export async function verifyContactIdentity(
  partnerId: string,
  incomingIdentityKeyBase64: string
): Promise<{ status: 'verified' | 'unverified' | 'key_changed'; previousKey?: string }> {
  const db = await getCryptoDB();
  const session = await db.get('sessions', partnerId);

  if (!session) {
    return { status: 'unverified' };
  }

  if (session.partnerIdentityKey !== incomingIdentityKeyBase64) {
    return {
      status: 'key_changed',
      previousKey: session.partnerIdentityKey,
    };
  }

  const verifiedRecord = await db.get('verified_fingerprints', partnerId);
  return {
    status: verifiedRecord ? 'verified' : 'unverified',
  };
}

/**
 * Mark a contact's safety number as manually verified by user
 */
export async function markSafetyNumberVerified(partnerId: string, fingerprint: string) {
  const db = await getCryptoDB();
  await db.put('verified_fingerprints', {
    partnerId,
    fingerprint,
    verifiedAt: new Date().toISOString(),
  });
}
