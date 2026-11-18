import { initCrypto } from './crypto';
import { apiUploadEncryptedMediaChunked, apiDownloadEncryptedMedia } from './api';
import { compressImageWorker, encryptMediaWorker, decryptMediaWorker } from './workerClient';

export interface EncryptedMediaMetadata {
  mediaUrl: string;       // Strict relative path: /api/media/...
  key: string;            // Base64 32-byte secret key (transmitted ONLY inside E2EE message)
  header: string;         // Base64 crypto_secretstream header (24 bytes)
  mimeType: string;       // Validated safe MIME type
  fileName?: string;
  fileSize: number;
  thumbnail?: string;     // Instant 32x32 WebP data URL for blur placeholder
  width?: number;
  height?: number;
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
 * Revoke and clear cached object URLs to prevent memory bloat in long sessions
 */
export function revokeDecryptedMediaUrls(): void {
  for (const [, url] of objectUrlCache) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  objectUrlCache.clear();
}

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
 * Heavy compression and encryption run off-main-thread in a Web Worker.
 * Uploads chunked with progress callback and cancel signal support.
 */
export async function encryptAndUploadMedia(
  file: File | Blob,
  fallbackMimeType = 'image/jpeg',
  options: {
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<EncryptedMediaMetadata> {
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB limit.`);
  }

  const rawMime = (file as File).type || fallbackMimeType;
  const cleanMime = rawMime.toLowerCase().split(';')[0].trim();

  if (!ALLOWED_MIME_TYPES.has(cleanMime)) {
    throw new Error(`Unsupported or unsafe media type: ${cleanMime}`);
  }

  let fileToEncrypt: File | Blob = file;
  let thumbnail = '';
  let width = 0;
  let height = 0;

  // 1. If it's an image, run client-side compression & thumbnail generation in worker
  if (cleanMime.startsWith('image/') && cleanMime !== 'image/gif' && file instanceof File) {
    try {
      const compResult = await compressImageWorker(file, 1600, 0.82);
      if (compResult.compressedBlob && compResult.compressedBlob.size > 0) {
        fileToEncrypt = compResult.compressedBlob;
        thumbnail = compResult.thumbnail;
        width = compResult.width;
        height = compResult.height;
      }
    } catch (e) {
      console.warn('[Media Pipeline] Image compression failed, proceeding with original', e);
    }
  }

  // 2. Read bytes
  const arrayBuffer = await fileToEncrypt.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);

  // 3. Encrypt off-main-thread via Web Worker (secretstream XChaCha20-Poly1305)
  const encResult = await encryptMediaWorker(fileBytes);

  // 4. Resumable Chunked Upload to server with progress reporting
  const result = await apiUploadEncryptedMediaChunked(encResult.encryptedBlob, {
    onProgress: options.onProgress,
    signal: options.signal,
  });

  if (!validateMediaUrl(result.mediaUrl)) {
    throw new Error('Server returned an invalid media URL format');
  }

  const fileName = (file as File).name || 'media';

  const metadata: EncryptedMediaMetadata = {
    mediaUrl: result.mediaUrl,
    key: encResult.keyBase64,
    header: encResult.nonceBase64,
    mimeType: fileToEncrypt.type || cleanMime,
    fileName,
    fileSize: fileToEncrypt.size,
    thumbnail,
    width: width || undefined,
    height: height || undefined,
  };

  // Cache the local file as an object URL immediately for sender's instant view
  const localUrl = URL.createObjectURL(fileToEncrypt);
  objectUrlCache.set(result.mediaUrl, localUrl);

  return metadata;
}

/**
 * Download an encrypted ciphertext blob from the server,
 * decrypt it using crypto_secretstream_xchacha20poly1305 in a Web Worker, and return a displayable Blob URL.
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

  // Download raw ciphertext payload from own origin
  const encryptedPayload = await apiDownloadEncryptedMedia(mediaUrl);

  // Check if header is already prepended to encryptedPayload
  let payloadForWorker = encryptedPayload;
  if (headerBase64) {
    const sodium = await initCrypto();
    const headerBytes = sodium.from_base64(headerBase64);

    // If payload does not start with header, prepend it
    let startsWithHeader = false;
    if (encryptedPayload.length >= headerBytes.length) {
      startsWithHeader = true;
      for (let i = 0; i < headerBytes.length; i++) {
        if (encryptedPayload[i] !== headerBytes[i]) {
          startsWithHeader = false;
          break;
        }
      }
    }

    if (!startsWithHeader) {
      const combined = new Uint8Array(headerBytes.length + encryptedPayload.length);
      combined.set(headerBytes, 0);
      combined.set(encryptedPayload, headerBytes.length);
      payloadForWorker = combined;
    }
  }

  // Decrypt in Web Worker off main thread
  const decryptedBytes = await decryptMediaWorker(payloadForWorker, keyBase64);

  // Create Object URL for display
  const decryptedBlob = new Blob([decryptedBytes.buffer as ArrayBuffer], { type: cleanMime });
  const objectUrl = URL.createObjectURL(decryptedBlob);

  objectUrlCache.set(mediaUrl, objectUrl);
  return objectUrl;
}
