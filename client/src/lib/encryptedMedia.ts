import { initCrypto } from './crypto';
import { apiUploadEncryptedMedia, apiDownloadEncryptedMedia } from './api';

export interface EncryptedMediaMetadata {
  mediaUrl: string;       // Strict relative path: /api/media/...
  key: string;            // Base64 32-byte secret key (transmitted ONLY inside E2EE message)
  header: string;         // Base64 crypto_secretstream header (24 bytes)
  mimeType: string;       // Validated safe MIME type
  fileName?: string;
  fileSize: number;
}

const MAX_MEDIA_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB strict cap

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
  'video/mp4',
  'video/webm',
]);

// In-memory cache for decrypted object URLs: mediaUrl -> objectUrl
const objectUrlCache = new Map<string, string>();

/**
 * Validates that mediaUrl strictly points to our own origin's /api/media/ endpoint.
 * Prevents SSRF / external origin tracking.
 */
export function validateMediaUrl(mediaUrl: string): boolean {
  if (typeof mediaUrl !== 'string') return false;
  const clean = mediaUrl.trim();
  if (!clean.startsWith('/api/media/')) return false;
  if (clean.includes('..') || clean.includes('://')) return false;
  return /^\/api\/media\/[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]+)?$/.test(clean);
}

/**
 * Encrypt a file locally using libsodium's chunk-safe crypto_secretstream_xchacha20poly1305.
 * The server sees ONLY opaque encrypted bytes.
 */
export async function encryptAndUploadMedia(
  file: File | Blob,
  fallbackMimeType = 'image/jpeg'
): Promise<EncryptedMediaMetadata> {
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB limit.`);
  }

  const rawMime = (file as File).type || fallbackMimeType;
  const cleanMime = rawMime.toLowerCase().split(';')[0].trim();

  if (!ALLOWED_MIME_TYPES.has(cleanMime)) {
    throw new Error(`Unsupported or unsafe media type: ${cleanMime}`);
  }

  const sodium = await initCrypto();

  const arrayBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);

  // Generate 32-byte symmetric secretstream key
  const key = sodium.crypto_secretstream_xchacha20poly1305_keygen();

  // Initialize push stream (produces 24-byte header)
  const res = sodium.crypto_secretstream_xchacha20poly1305_init_push(key);
  const state = res.state;
  const header = res.header;

  // Encrypt file bytes in one authenticated stream with TAG_FINAL
  const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    fileBytes,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );

  // Upload encrypted ciphertext to server
  const blob = new Blob([ciphertext.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const result = await apiUploadEncryptedMedia(blob);

  if (!validateMediaUrl(result.mediaUrl)) {
    throw new Error('Server returned an invalid media URL format');
  }

  const fileName = (file as File).name || 'media';

  const metadata: EncryptedMediaMetadata = {
    mediaUrl: result.mediaUrl,
    key: sodium.to_base64(key),
    header: sodium.to_base64(header),
    mimeType: cleanMime,
    fileName,
    fileSize: file.size,
  };

  // Cache the local file as an object URL immediately for sender's view
  const localUrl = URL.createObjectURL(file);
  objectUrlCache.set(result.mediaUrl, localUrl);

  return metadata;
}

/**
 * Download an encrypted ciphertext blob from the server,
 * decrypt it using crypto_secretstream_xchacha20poly1305, and return a displayable Blob URL.
 */
export async function downloadAndDecryptMedia(
  mediaUrl: string,
  keyBase64: string,
  headerBase64: string,
  mimeType: string
): Promise<string> {
  if (objectUrlCache.has(mediaUrl)) {
    return objectUrlCache.get(mediaUrl)!;
  }

  if (!validateMediaUrl(mediaUrl)) {
    throw new Error('Refusing to fetch media: mediaUrl is not from a trusted origin /api/media/');
  }

  const cleanMime = (mimeType || 'image/jpeg').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES.has(cleanMime)) {
    throw new Error(`Untrusted MIME type in media message: ${cleanMime}`);
  }

  const sodium = await initCrypto();
  const key = sodium.from_base64(keyBase64);
  const header = sodium.from_base64(headerBase64);

  // Download raw ciphertext payload from own origin
  const encryptedPayload = await apiDownloadEncryptedMedia(mediaUrl);

  // Initialize pull stream
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, key);

  // Pull and authenticate payload
  const pullResult = sodium.crypto_secretstream_xchacha20poly1305_pull(state, encryptedPayload, null);
  if (!pullResult || pullResult.tag !== sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) {
    throw new Error('Encrypted media stream was truncated or tampered with');
  }

  const decryptedBytes = pullResult.message;

  // Create Object URL for display
  const decryptedBlob = new Blob([decryptedBytes.buffer as ArrayBuffer], { type: cleanMime });
  const objectUrl = URL.createObjectURL(decryptedBlob);

  objectUrlCache.set(mediaUrl, objectUrl);
  return objectUrl;
}
