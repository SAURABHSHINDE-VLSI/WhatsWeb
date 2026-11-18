import _sodium from 'libsodium-wrappers';

let workerInstance: Worker | null = null;
const pendingRequests = new Map<
  string,
  { resolve: (val: any) => void; reject: (err: any) => void }
>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('../workers/crypto.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerInstance.onmessage = (e: MessageEvent) => {
        const { id, success, error, ...data } = e.data;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          if (success) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(error || 'Worker operation failed'));
          }
        }
      };
      workerInstance.onerror = (err) => {
        console.error('[Crypto Worker Error]', err);
      };
    } catch (e) {
      console.warn('[Crypto Worker] Failed to instantiate worker, falling back to main thread', e);
      workerInstance = null;
    }
  }
  return workerInstance;
}

/**
 * Compress an image off the main thread in a Web Worker,
 * returning the compressed WebP bytes and an encrypted thumbnail preview.
 */
export async function compressImageWorker(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{
  compressedBlob: Blob;
  thumbnail: string;
  width: number;
  height: number;
}> {
  const worker = getWorker();
  if (worker && typeof createImageBitmap !== 'undefined') {
    try {
      const imageBitmap = await createImageBitmap(file);
      const id = 'compress_' + Math.random().toString(36).slice(2);
      const promise = new Promise<{
        compressedBytes: Uint8Array;
        mimeType: string;
        thumbnail: string;
        width: number;
        height: number;
      }>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
      });

      worker.postMessage(
        {
          type: 'IMAGE_COMPRESS',
          id,
          imageBitmap,
          maxDimension,
          quality,
        },
        [imageBitmap]
      );

      const res = await promise;
      return {
        compressedBlob: new Blob([res.compressedBytes.buffer as ArrayBuffer], { type: res.mimeType }),
        thumbnail: res.thumbnail,
        width: res.width,
        height: res.height,
      };
    } catch (err) {
      console.warn('[Worker Compress] Failed, falling back to main thread', err);
    }
  }

  // Fallback to original file
  return {
    compressedBlob: file,
    thumbnail: '',
    width: 0,
    height: 0,
  };
}

/**
 * Encrypt media bytes off the main thread in a Web Worker
 */
export async function encryptMediaWorker(
  fileBytes: Uint8Array
): Promise<{
  encryptedBlob: Uint8Array;
  keyBase64: string;
  nonceBase64: string;
  size: number;
}> {
  const worker = getWorker();
  if (worker) {
    try {
      const id = 'enc_' + Math.random().toString(36).slice(2);
      const promise = new Promise<{
        encryptedBlob: Uint8Array;
        keyBase64: string;
        nonceBase64: string;
        size: number;
      }>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
      });

      // Clone array to avoid detachment issues if needed
      const copy = new Uint8Array(fileBytes);
      worker.postMessage(
        {
          type: 'MEDIA_ENCRYPT',
          id,
          fileBytes: copy,
        },
        [copy.buffer]
      );

      return await promise;
    } catch (err) {
      console.warn('[Worker Encrypt] Fallback to main thread', err);
    }
  }

  // Main thread fallback
  await _sodium.ready;
  const sodium = _sodium;
  const mediaKey = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  const initRes = sodium.crypto_secretstream_xchacha20poly1305_init_push(mediaKey);
  const encChunk = sodium.crypto_secretstream_xchacha20poly1305_push(
    initRes.state,
    fileBytes,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );
  const total = new Uint8Array(initRes.header.length + encChunk.length);
  total.set(initRes.header, 0);
  total.set(encChunk, initRes.header.length);

  return {
    encryptedBlob: total,
    keyBase64: sodium.to_base64(mediaKey),
    nonceBase64: sodium.to_base64(initRes.header),
    size: fileBytes.length,
  };
}

/**
 * Decrypt media bytes off the main thread in a Web Worker
 */
export async function decryptMediaWorker(
  encryptedBytes: Uint8Array,
  keyBase64: string
): Promise<Uint8Array> {
  const worker = getWorker();
  if (worker) {
    try {
      const id = 'dec_' + Math.random().toString(36).slice(2);
      const promise = new Promise<{ plaintextBytes: Uint8Array }>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
      });

      const copy = new Uint8Array(encryptedBytes);
      worker.postMessage(
        {
          type: 'MEDIA_DECRYPT',
          id,
          encryptedBytes: copy,
          keyBase64,
        },
        [copy.buffer]
      );

      const res = await promise;
      return res.plaintextBytes;
    } catch (err) {
      console.warn('[Worker Decrypt] Fallback to main thread', err);
    }
  }

  // Main thread fallback
  await _sodium.ready;
  const sodium = _sodium;
  const mediaKey = sodium.from_base64(keyBase64);
  const headerBytes = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
  const header = encryptedBytes.slice(0, headerBytes);
  const cipherBody = encryptedBytes.slice(headerBytes);
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, mediaKey);
  const pullRes = sodium.crypto_secretstream_xchacha20poly1305_pull(state, cipherBody, null);
  if (pullRes === false) {
    throw new Error('Decryption failed: media altered or tampered');
  }
  return (pullRes as { message: Uint8Array }).message;
}
