import { initCrypto } from './crypto';
import { apiUploadEncryptedMedia, apiDownloadEncryptedMedia } from './api';

export interface EncryptedMediaMetadata {
  mediaUrl: string;
  key: string; // Base64 32-byte secret key
  mimeType: string;
  fileName?: string;
  fileSize?: number;
}

// In-memory cache for decrypted object URLs: mediaUrl -> objectUrl
const objectUrlCache = new Map<string, string>();

/**
 * Encrypt a file locally using libsodium crypto_secretbox (XSalsa20-Poly1305)
 * and upload the ciphertext blob to the server.
 * The server sees ONLY opaque encrypted bytes.
 */
export async function encryptAndUploadMedia(
  file: File | Blob,
  fallbackMimeType = 'image/jpeg'
): Promise<EncryptedMediaMetadata> {
  const sodium = await initCrypto();

  const arrayBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(arrayBuffer);

  // Generate ephemeral 32-byte symmetric key & 24-byte nonce
  const mediaKey = sodium.crypto_secretbox_keygen();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // Encrypt file bytes
  const ciphertext = sodium.crypto_secretbox_easy(fileBytes, nonce, mediaKey);

  // Combine nonce (24 bytes) + ciphertext into a single payload
  const payload = new Uint8Array(nonce.length + ciphertext.length);
  payload.set(nonce, 0);
  payload.set(ciphertext, nonce.length);

  // Upload encrypted ciphertext to server
  const blob = new Blob([payload.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const result = await apiUploadEncryptedMedia(blob);

  const mimeType = (file as File).type || fallbackMimeType;
  const fileName = (file as File).name || 'media';

  const metadata: EncryptedMediaMetadata = {
    mediaUrl: result.mediaUrl,
    key: sodium.to_base64(mediaKey),
    mimeType,
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
 * decrypt it using the session-exchanged mediaKey, and return a displayable Blob URL.
 */
export async function downloadAndDecryptMedia(
  mediaUrl: string,
  keyBase64: string,
  mimeType: string
): Promise<string> {
  if (objectUrlCache.has(mediaUrl)) {
    return objectUrlCache.get(mediaUrl)!;
  }

  const sodium = await initCrypto();
  const key = sodium.from_base64(keyBase64);

  // Download raw ciphertext payload
  const encryptedPayload = await apiDownloadEncryptedMedia(mediaUrl);

  // Extract nonce and ciphertext
  const nonceBytes = sodium.crypto_secretbox_NONCEBYTES;
  if (encryptedPayload.length < nonceBytes + 16) {
    throw new Error('Encrypted media payload is corrupted or truncated');
  }

  const nonce = encryptedPayload.subarray(0, nonceBytes);
  const ciphertext = encryptedPayload.subarray(nonceBytes);

  // Decrypt ciphertext
  const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  // Create Object URL for display
  const decryptedBlob = new Blob([decryptedBytes.buffer as ArrayBuffer], { type: mimeType || 'image/jpeg' });
  const objectUrl = URL.createObjectURL(decryptedBlob);

  objectUrlCache.set(mediaUrl, objectUrl);
  return objectUrl;
}
