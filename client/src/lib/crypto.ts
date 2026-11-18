import sodium from 'libsodium-wrappers';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * Versioned, tamper-evident E2EE message envelope.
 * Carries all cryptographic parameters required for X3DH and Double Ratchet decryption.
 */
export interface E2EEnvelope {
  version: 1;
  type: 'prekey' | 'whisper';
  senderIdentityKey: string;      // Sender's X25519 DH public key (Base64)
  senderIdentitySignKey?: string;  // Sender's Ed25519 signing public key (Base64, on initial message)
  ephemeralKey?: string;          // Sender's X25519 ephemeral public key for X3DH (Base64)
  oneTimePreKeyId?: number | null; // ID of Bob's consumed OPK (if any)
  dhPublicKey: string;            // Sender's current DH ratchet public key (Base64)
  sequence: number;               // Message index in current symmetric chain
  previousChainLength: number;    // Number of messages in sender's previous sending chain
  ciphertext: string;             // XChaCha20-Poly1305 ciphertext (Base64)
  nonce: string;                  // 24-byte random nonce (Base64)
}

export interface IdentityKeyPair {
  signPublicKey: string; // Ed25519 Base64
  signPrivateKey: string; // Ed25519 Base64 (Wrapped at rest)
  dhPublicKey: string; // X25519 Base64
  dhPrivateKey: string; // X25519 Base64 (Wrapped at rest)
}

export interface SignedPreKeyPair {
  publicKey: string; // X25519 Base64
  privateKey: string; // X25519 Base64 (Wrapped at rest)
  signature: string; // Ed25519 signature Base64
  createdAt: number;
}

export interface OneTimePreKeyPair {
  keyId: number;
  publicKey: string; // X25519 Base64
  privateKey: string; // X25519 Base64 (Wrapped at rest)
}

/**
 * Full Double Ratchet Session State conforming to Signal Double Ratchet Specification
 */
export interface SessionState {
  partnerId: string;
  partnerIdentityKey: string;     // Partner's long-term X25519 DH key (Base64)
  partnerIdentitySignKey?: string; // Partner's long-term Ed25519 signing key (Base64)
  dhsPair: {                      // Our current DH Ratchet keypair
    publicKey: string;
    privateKey: string;
  };
  dhrPub: string | null;          // Partner's current DH Ratchet public key
  rootKey: string;                // 32-byte Base64 root key
  sendChainKey: string | null;    // 32-byte Base64 sending chain key
  recvChainKey: string | null;    // 32-byte Base64 receiving chain key
  sendSequence: number;           // Number of messages sent in current sending chain
  recvSequence: number;           // Number of messages received in current receiving chain
  previousChainLength: number;    // Length of our previous sending chain
  skippedKeys: Record<string, string>; // "(dhrPub,sequence)" -> 32-byte Base64 messageKey
  verifiedSafetyNumber?: boolean;
  safetyNumberChanged?: boolean;
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
    value: { partnerId: string; identityKey: string; verifiedAt?: string; acknowledged?: boolean };
  };
  key_wrapping: {
    key: string;
    value: CryptoKey;
  };
}

let cryptoDbPromise: Promise<IDBPDatabase<CryptoKeyStoreDB>> | null = null;
let wrappingKeyPromise: Promise<CryptoKey> | null = null;

async function getCryptoDB(): Promise<IDBPDatabase<CryptoKeyStoreDB>> {
  if (!cryptoDbPromise) {
    cryptoDbPromise = openDB<CryptoKeyStoreDB>('editorial_crypto_keystore_v2', 1, {
      upgrade(db) {
        db.createObjectStore('identity');
        db.createObjectStore('signed_prekeys');
        db.createObjectStore('one_time_prekeys', { keyPath: 'keyId' });
        db.createObjectStore('sessions', { keyPath: 'partnerId' });
        db.createObjectStore('verified_fingerprints', { keyPath: 'partnerId' });
        db.createObjectStore('key_wrapping');
      },
    });
  }
  return cryptoDbPromise;
}

/**
 * Non-extractable WebCrypto key wrapping
 * Protects private keys at rest so raw private keys are not plain strings in IndexedDB.
 */
async function getWrappingKey(): Promise<CryptoKey> {
  if (!wrappingKeyPromise) {
    wrappingKeyPromise = (async () => {
      const db = await getCryptoDB();
      const existing = await db.get('key_wrapping', 'master_wrapping_key');
      if (existing) return existing;

      // Generate non-extractable 256-bit AES-GCM wrapping key
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable!
        ['encrypt', 'decrypt']
      );

      await db.put('key_wrapping', key, 'master_wrapping_key');
      return key;
    })();
  }
  return wrappingKeyPromise;
}

export async function wrapKey(rawBytes: Uint8Array): Promise<string> {
  const wrappingKey = await getWrappingKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const copy = new Uint8Array(rawBytes.length);
  copy.set(rawBytes);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    copy.buffer
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return sodium.to_base64(combined);
}

export async function unwrapKey(wrappedBase64: string): Promise<Uint8Array> {
  const wrappingKey = await getWrappingKey();
  const combined = sodium.from_base64(wrappedBase64);
  const iv = combined.slice(0, 12);
  const encryptedPart = combined.slice(12);
  const copy = new Uint8Array(encryptedPart.length);
  copy.set(encryptedPart);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    copy.buffer
  );
  return new Uint8Array(decrypted);
}

export async function initCrypto(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

/**
 * Signal-spec HKDF (HMAC-based Key Derivation Function) using libsodium crypto_auth
 */
function hkdf(inputKeyMaterial: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  // 1. Extract: PRK = HMAC-Hash(salt, IKM)
  const saltKey = salt.length === 32 ? salt : new Uint8Array(32);
  const prk = sodium.crypto_auth(inputKeyMaterial, saltKey);

  // 2. Expand
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

/**
 * Root KDF conforming to Signal Double Ratchet Specification
 * Returns: { nextRootKey (32 bytes), chainKey (32 bytes) }
 */
function kdfRootKey(rootKey: Uint8Array, dhOut: Uint8Array): { nextRootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdf(dhOut, rootKey, sodium.from_string('WhisperRatchet'), 64);
  return {
    nextRootKey: derived.subarray(0, 32),
    chainKey: derived.subarray(32, 64),
  };
}

/**
 * Chain KDF conforming to Signal Double Ratchet Specification
 * Returns: { nextChainKey (32 bytes), messageKey (32 bytes) }
 */
function kdfChainKey(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  const messageKey = sodium.crypto_auth(sodium.from_string('\x01'), chainKey);
  const nextChainKey = sodium.crypto_auth(sodium.from_string('\x02'), chainKey);
  return { nextChainKey, messageKey };
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

  const wrappedSignPriv = await wrapKey(signPair.privateKey);
  const wrappedDhPriv = await wrapKey(dhSec);

  const keyPair: IdentityKeyPair = {
    signPublicKey: sodium.to_base64(signPair.publicKey),
    signPrivateKey: wrappedSignPriv,
    dhPublicKey: sodium.to_base64(dhPub),
    dhPrivateKey: wrappedDhPriv,
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
  const unwrappedSignPriv = await unwrapKey(identity.signPrivateKey);
  const signature = sodium.crypto_sign_detached(spkPair.publicKey, unwrappedSignPriv);

  // Securely zero unwrapped private key in memory
  sodium.memzero(unwrappedSignPriv);

  const wrappedSpkPriv = await wrapKey(spkPair.privateKey);

  const spk: SignedPreKeyPair = {
    publicKey: sodium.to_base64(spkPair.publicKey),
    privateKey: wrappedSpkPriv,
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
    const wrappedPriv = await wrapKey(pair.privateKey);

    const item: OneTimePreKeyPair = {
      keyId: (Date.now() % 100000000) + i + Math.floor(Math.random() * 1000),
      publicKey: sodium.to_base64(pair.publicKey),
      privateKey: wrappedPriv,
    };
    keys.push(item);
    await db.put('one_time_prekeys', item);
  }

  return keys;
}

/**
 * Compute Signal-standard Safety Number formatted as 12 groups of 5 digits (60 digits total)
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

export async function markSafetyNumberVerified(partnerId: string, safetyNum: string): Promise<void> {
  const db = await getCryptoDB();
  const session = await db.get('sessions', partnerId);
  if (session) {
    session.verifiedSafetyNumber = true;
    session.safetyNumberChanged = false;
    await db.put('sessions', session);
  }
  await db.put('verified_fingerprints', {
    partnerId,
    identityKey: session ? session.partnerIdentityKey : '',
    verifiedAt: new Date().toISOString(),
    acknowledged: true,
  });
}

/**
 * Check Trust on First Use (TOFU) and detect identity key changes
 */
export async function verifyOrUpdateTrustOnFirstUse(
  partnerId: string,
  newIdentityKey: string
): Promise<{ trusted: boolean; changed: boolean }> {
  const db = await getCryptoDB();
  const existing = await db.get('verified_fingerprints', partnerId);

  if (!existing) {
    // First time encountering this contact: Trust on First Use
    await db.put('verified_fingerprints', {
      partnerId,
      identityKey: newIdentityKey,
      acknowledged: false,
    });
    return { trusted: true, changed: false };
  }

  if (existing.identityKey !== newIdentityKey) {
    // KEY CHANGE DETECTED!
    console.warn(`[E2EE SECURITY ALERT] Identity key changed for ${partnerId}!`);
    return { trusted: false, changed: true };
  }

  return { trusted: true, changed: false };
}

/**
 * Establish E2EE Session with recipient using X3DH-style key agreement and initialize Double Ratchet
 */
export async function getOrCreateSession(
  partnerId: string,
  partnerKeyBundle?: {
    identityKey: string;
    identitySignKey?: string;
    signedPreKey: string;
    signedPreKeySignature?: string;
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
  }
): Promise<{ session: SessionState; initialEnvelopeParams?: { ephemeralKey: string; oneTimePreKeyId?: number | null } }> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('sessions', partnerId);
  if (existing) {
    return { session: existing };
  }

  if (!partnerKeyBundle) {
    throw new Error(`No existing session and no key bundle provided for ${partnerId}`);
  }

  // 1. Verify Signed Pre-Key Signature if signature & signKey are provided
  if (partnerKeyBundle.identitySignKey && partnerKeyBundle.signedPreKeySignature) {
    const sigBytes = sodium.from_base64(partnerKeyBundle.signedPreKeySignature);
    const spkBytes = sodium.from_base64(partnerKeyBundle.signedPreKey);
    const signKeyBytes = sodium.from_base64(partnerKeyBundle.identitySignKey);

    const validSig = sodium.crypto_sign_verify_detached(sigBytes, spkBytes, signKeyBytes);
    if (!validSig) {
      throw new Error(`Invalid signed pre-key signature from ${partnerId}. Connection aborted.`);
    }
  }

  // 2. Trust on First Use verification
  const tofu = await verifyOrUpdateTrustOnFirstUse(partnerId, partnerKeyBundle.identityKey);
  if (tofu.changed) {
    throw new Error(`Safety number has changed for this contact. Sending blocked until acknowledged.`);
  }

  const identity = await getOrCreateIdentityKey();
  const unwrappedMyDhPriv = await unwrapKey(identity.dhPrivateKey);

  const theirDhPub = sodium.from_base64(partnerKeyBundle.identityKey);
  const theirSpkPub = sodium.from_base64(partnerKeyBundle.signedPreKey);

  // Generate ephemeral keypair for X3DH
  const ephemPair = sodium.crypto_box_keypair();

  // DH1 = myIdentityDhPriv * theirSpkPub
  const dh1 = sodium.crypto_scalarmult(unwrappedMyDhPriv, theirSpkPub);
  // DH2 = myEphemPriv * theirIdentityDhPub
  const dh2 = sodium.crypto_scalarmult(ephemPair.privateKey, theirDhPub);
  // DH3 = myEphemPriv * theirSpkPub
  const dh3 = sodium.crypto_scalarmult(ephemPair.privateKey, theirSpkPub);

  sodium.memzero(unwrappedMyDhPriv);

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

  // Derive initial shared master key via HKDF
  const masterSharedKey = hkdf(combined, new Uint8Array(32), sodium.from_string('WhisperRatchetMaster'), 32);

  // Generate initial DH ratchet keypair for Alice
  const ourDhsPair = sodium.crypto_box_keypair();
  const wrappedOurDhsPriv = await wrapKey(ourDhsPair.privateKey);

  // Alice performs DH ratchet with Bob's SPK as Bob's initial DH ratchet key
  const initialDh = sodium.crypto_scalarmult(ourDhsPair.privateKey, theirSpkPub);
  const { nextRootKey, chainKey: sendChain } = kdfRootKey(masterSharedKey, initialDh);

  const session: SessionState = {
    partnerId,
    partnerIdentityKey: partnerKeyBundle.identityKey,
    partnerIdentitySignKey: partnerKeyBundle.identitySignKey,
    dhsPair: {
      publicKey: sodium.to_base64(ourDhsPair.publicKey),
      privateKey: wrappedOurDhsPriv,
    },
    dhrPub: partnerKeyBundle.signedPreKey,
    rootKey: sodium.to_base64(nextRootKey),
    sendChainKey: sodium.to_base64(sendChain),
    recvChainKey: null,
    sendSequence: 0,
    recvSequence: 0,
    previousChainLength: 0,
    skippedKeys: {},
  };

  await db.put('sessions', session);

  return {
    session,
    initialEnvelopeParams: {
      ephemeralKey: sodium.to_base64(ephemPair.publicKey),
      oneTimePreKeyId: partnerKeyBundle.oneTimePreKey ? partnerKeyBundle.oneTimePreKey.keyId : null,
    },
  };
}

/**
 * Handle incoming X3DH session initiation on receiver side conforming to Signal spec
 */
export async function initializeReceivingSession(
  partnerId: string,
  partnerIdentityKey: string,
  ephemeralKeyBase64: string,
  opkId?: number | null,
  partnerIdentitySignKey?: string
): Promise<SessionState> {
  await sodium.ready;
  const db = await getCryptoDB();
  const existing = await db.get('sessions', partnerId);
  if (existing) return existing;

  // Verify TOFU
  const tofu = await verifyOrUpdateTrustOnFirstUse(partnerId, partnerIdentityKey);
  if (tofu.changed) {
    console.warn(`[E2EE] Safety number changed during session initialization for ${partnerId}`);
  }

  const identity = await getOrCreateIdentityKey();
  const spk = await getOrCreateSignedPreKey(identity);

  const theirIdentityPub = sodium.from_base64(partnerIdentityKey);
  const theirEphemPub = sodium.from_base64(ephemeralKeyBase64);

  const unwrappedMySpkPriv = await unwrapKey(spk.privateKey);
  const unwrappedMyIdentityDhPriv = await unwrapKey(identity.dhPrivateKey);

  // DH1 = mySpkPriv * theirIdentityPub
  const dh1 = sodium.crypto_scalarmult(unwrappedMySpkPriv, theirIdentityPub);
  // DH2 = myIdentityDhPriv * theirEphemPub
  const dh2 = sodium.crypto_scalarmult(unwrappedMyIdentityDhPriv, theirEphemPub);
  // DH3 = mySpkPriv * theirEphemPub
  const dh3 = sodium.crypto_scalarmult(unwrappedMySpkPriv, theirEphemPub);

  sodium.memzero(unwrappedMyIdentityDhPriv);

  let totalLen = 32 * 3;
  let dh4: Uint8Array | null = null;

  if (typeof opkId === 'number') {
    const opk = await db.get('one_time_prekeys', opkId);
    if (opk) {
      const unwrappedOpkPriv = await unwrapKey(opk.privateKey);
      dh4 = sodium.crypto_scalarmult(unwrappedOpkPriv, theirEphemPub);
      totalLen += 32;
      sodium.memzero(unwrappedOpkPriv);
      // Delete consumed OPK from local database
      await db.delete('one_time_prekeys', opkId);
    }
  }

  const combined = new Uint8Array(totalLen);
  combined.set(dh1, 0);
  combined.set(dh2, 32);
  combined.set(dh3, 64);
  if (dh4) combined.set(dh4, 96);

  const masterSharedKey = hkdf(combined, new Uint8Array(32), sodium.from_string('WhisperRatchetMaster'), 32);

  // Bob's DH keypair for Double Ratchet is initially his SPK
  const wrappedBobDhsPriv = await wrapKey(unwrappedMySpkPriv);
  sodium.memzero(unwrappedMySpkPriv);

  const session: SessionState = {
    partnerId,
    partnerIdentityKey,
    partnerIdentitySignKey,
    dhsPair: {
      publicKey: spk.publicKey,
      privateKey: wrappedBobDhsPriv,
    },
    dhrPub: null,
    rootKey: sodium.to_base64(masterSharedKey),
    sendChainKey: null,
    recvChainKey: null,
    sendSequence: 0,
    recvSequence: 0,
    previousChainLength: 0,
    skippedKeys: {},
    safetyNumberChanged: tofu.changed,
  };

  await db.put('sessions', session);
  return session;
}

/**
 * Encrypt message payload using Double Ratchet & XChaCha20-Poly1305.
 * Fails closed: Never sends plaintext if encryption fails.
 */
export async function encryptMessage(
  partnerId: string,
  plaintext: string,
  initialParams?: { ephemeralKey?: string; oneTimePreKeyId?: number | null }
): Promise<E2EEnvelope> {
  await sodium.ready;
  const db = await getCryptoDB();
  const session = await db.get('sessions', partnerId);
  if (!session) {
    throw new Error(`No active E2EE session established with ${partnerId}`);
  }

  const identity = await getOrCreateIdentityKey();

  if (!session.sendChainKey) {
    throw new Error('Sending chain key not initialized in Double Ratchet session');
  }

  const sendChainBytes = sodium.from_base64(session.sendChainKey);
  const { nextChainKey, messageKey } = kdfChainKey(sendChainBytes);

  // Nonce: 24 random bytes for XChaCha20-Poly1305
  const nonceBytes = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  // Associated Data binds envelope metadata deterministically
  const adBytes = sodium.from_string(
    JSON.stringify({
      v: 1,
      dh: session.dhsPair.publicKey,
      s: session.sendSequence,
      pn: session.previousChainLength,
    })
  );

  const plaintextBytes = sodium.from_string(plaintext);
  const ciphertextBytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    adBytes,
    null,
    nonceBytes,
    messageKey
  );

  // Zero messageKey immediately
  sodium.memzero(messageKey);

  const envelope: E2EEnvelope = {
    version: 1,
    type: initialParams?.ephemeralKey ? 'prekey' : 'whisper',
    senderIdentityKey: identity.dhPublicKey,
    senderIdentitySignKey: identity.signPublicKey,
    ephemeralKey: initialParams?.ephemeralKey,
    oneTimePreKeyId: initialParams?.oneTimePreKeyId,
    dhPublicKey: session.dhsPair.publicKey,
    sequence: session.sendSequence,
    previousChainLength: session.previousChainLength,
    ciphertext: sodium.to_base64(ciphertextBytes),
    nonce: sodium.to_base64(nonceBytes),
  };

  // Update session state
  session.sendChainKey = sodium.to_base64(nextChainKey);
  session.sendSequence++;
  await db.put('sessions', session);

  return envelope;
}

/**
 * Decrypt incoming message envelope using Double Ratchet state machine.
 * Correctly handles out-of-order messages, DH ratchet turns, and zeroing.
 */
export async function decryptMessage(
  partnerId: string,
  envelope: E2EEnvelope
): Promise<string> {
  await sodium.ready;
  const db = await getCryptoDB();
  let session = await db.get('sessions', partnerId);

  // 1. Initialize receiving session if this is an incoming prekey message
  if (!session) {
    if (envelope.type === 'prekey' && envelope.ephemeralKey) {
      session = await initializeReceivingSession(
        partnerId,
        envelope.senderIdentityKey,
        envelope.ephemeralKey,
        envelope.oneTimePreKeyId,
        envelope.senderIdentitySignKey
      );
    } else {
      throw new Error(`Cannot decrypt message: No active session for ${partnerId}`);
    }
  }

  // 2. Check if this message key was previously skipped (out-of-order delivery)
  const skippedKeyId = `${envelope.dhPublicKey}:${envelope.sequence}`;
  if (session.skippedKeys && session.skippedKeys[skippedKeyId]) {
    const rawMsgKey = sodium.from_base64(session.skippedKeys[skippedKeyId]);
    delete session.skippedKeys[skippedKeyId];
    await db.put('sessions', session);

    const nonceBytes = sodium.from_base64(envelope.nonce);
    const ciphertextBytes = sodium.from_base64(envelope.ciphertext);
    const adBytes = sodium.from_string(
      JSON.stringify({
        v: 1,
        dh: envelope.dhPublicKey,
        s: envelope.sequence,
        pn: envelope.previousChainLength,
      })
    );

    try {
      const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        ciphertextBytes,
        adBytes,
        nonceBytes,
        rawMsgKey
      );
      sodium.memzero(rawMsgKey);
      return sodium.to_string(decrypted);
    } catch (e) {
      sodium.memzero(rawMsgKey);
      throw new Error('AEAD authentication failed on skipped key decryption');
    }
  }

  // 3. DH Ratchet Step if partner sent a new DH Ratchet public key
  if (envelope.dhPublicKey !== session.dhrPub) {
    // Skip any unreceived messages from current receiving chain before advancing
    if (session.recvChainKey) {
      let currentRecvChain = sodium.from_base64(session.recvChainKey);
      for (let s = session.recvSequence; s < envelope.previousChainLength; s++) {
        const { nextChainKey, messageKey } = kdfChainKey(currentRecvChain);
        currentRecvChain = nextChainKey;
        // Bounded capacity: max 1000 skipped keys to avoid memory exhaustion
        if (Object.keys(session.skippedKeys).length < 1000 && session.dhrPub) {
          session.skippedKeys[`${session.dhrPub}:${s}`] = sodium.to_base64(messageKey);
        }
      }
    }

    // Advance DH Ratchet
    const currentRootKey = sodium.from_base64(session.rootKey);
    const theirNewDhPub = sodium.from_base64(envelope.dhPublicKey);

    const unwrappedMyDhsPriv = await unwrapKey(session.dhsPair.privateKey);
    const dhInput1 = sodium.crypto_scalarmult(unwrappedMyDhsPriv, theirNewDhPub);
    sodium.memzero(unwrappedMyDhsPriv);

    const { nextRootKey: root1, chainKey: newRecvChain } = kdfRootKey(currentRootKey, dhInput1);

    // Generate our new DH ratchet keypair for subsequent sends
    const ourNewDhs = sodium.crypto_box_keypair();
    const wrappedOurNewDhsPriv = await wrapKey(ourNewDhs.privateKey);

    const dhInput2 = sodium.crypto_scalarmult(ourNewDhs.privateKey, theirNewDhPub);
    const { nextRootKey: root2, chainKey: newSendChain } = kdfRootKey(root1, dhInput2);

    session.dhsPair = {
      publicKey: sodium.to_base64(ourNewDhs.publicKey),
      privateKey: wrappedOurNewDhsPriv,
    };
    session.dhrPub = envelope.dhPublicKey;
    session.rootKey = sodium.to_base64(root2);
    session.sendChainKey = sodium.to_base64(newSendChain);
    session.recvChainKey = sodium.to_base64(newRecvChain);
    session.previousChainLength = session.sendSequence;
    session.sendSequence = 0;
    session.recvSequence = 0;
  }

  // 4. Advance Symmetric Ratchet to message sequence
  if (!session.recvChainKey) {
    throw new Error('Receiving chain key not available for decryption');
  }

  let currentRecvChain = sodium.from_base64(session.recvChainKey);

  // Skip any unreceived messages in the current chain
  while (session.recvSequence < envelope.sequence) {
    const { nextChainKey, messageKey } = kdfChainKey(currentRecvChain);
    currentRecvChain = nextChainKey;
    if (Object.keys(session.skippedKeys).length < 1000) {
      session.skippedKeys[`${envelope.dhPublicKey}:${session.recvSequence}`] = sodium.to_base64(messageKey);
    }
    session.recvSequence++;
  }

  // Decrypt current message
  const { nextChainKey, messageKey } = kdfChainKey(currentRecvChain);
  session.recvChainKey = sodium.to_base64(nextChainKey);
  session.recvSequence++;

  const nonceBytes = sodium.from_base64(envelope.nonce);
  const ciphertextBytes = sodium.from_base64(envelope.ciphertext);
  const adBytes = sodium.from_string(
    JSON.stringify({
      v: 1,
      dh: envelope.dhPublicKey,
      s: envelope.sequence,
      pn: envelope.previousChainLength,
    })
  );

  let plaintextBytes: Uint8Array;
  try {
    plaintextBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertextBytes,
      adBytes,
      nonceBytes,
      messageKey
    );
  } finally {
    // Cryptographically zero messageKey immediately after decryption
    sodium.memzero(messageKey);
  }

  await db.put('sessions', session);
  return sodium.to_string(plaintextBytes);
}
