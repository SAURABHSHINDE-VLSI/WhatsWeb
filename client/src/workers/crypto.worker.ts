/// <reference lib="webworker" />
import _sodium from 'libsodium-wrappers';

declare let self: DedicatedWorkerGlobalScope;

let sodiumReadyPromise: Promise<typeof _sodium> | null = null;

function getSodium(): Promise<typeof _sodium> {
  if (!sodiumReadyPromise) {
    sodiumReadyPromise = _sodium.ready.then(() => _sodium);
  }
  return sodiumReadyPromise;
}

export interface WorkerImageCompressRequest {
  type: 'IMAGE_COMPRESS';
  id: string;
  imageBitmap: ImageBitmap;
  maxDimension: number;
  quality: number;
}

export interface WorkerMediaEncryptRequest {
  type: 'MEDIA_ENCRYPT';
  id: string;
  fileBytes: Uint8Array;
}

export interface WorkerMediaDecryptRequest {
  type: 'MEDIA_DECRYPT';
  id: string;
  encryptedBytes: Uint8Array;
  keyBase64: string;
}

export type WorkerRequest =
  | WorkerImageCompressRequest
  | WorkerMediaEncryptRequest
  | WorkerMediaDecryptRequest;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'IMAGE_COMPRESS') {
      const { id, imageBitmap, maxDimension, quality } = req;
      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      // Render on OffscreenCanvas in Worker
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas context not available');

      ctx.drawImage(imageBitmap, 0, 0, width, height);

      // Compress to WebP (fallback to JPEG)
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      const arrayBuffer = await blob.arrayBuffer();

      // Generate ultra-low-res thumbnail for instant message preview (32x32)
      const thumbCanvas = new OffscreenCanvas(32, 32);
      const thumbCtx = thumbCanvas.getContext('2d');
      let thumbnailDataUrl = '';
      if (thumbCtx) {
        thumbCtx.drawImage(imageBitmap, 0, 0, 32, 32);
        const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/webp', quality: 0.3 });
        const thumbBuf = await thumbBlob.arrayBuffer();
        const sodium = await getSodium();
        thumbnailDataUrl = `data:image/webp;base64,${sodium.to_base64(new Uint8Array(thumbBuf))}`;
      }

      imageBitmap.close();

      self.postMessage(
        {
          id,
          success: true,
          compressedBytes: new Uint8Array(arrayBuffer),
          mimeType: 'image/webp',
          thumbnail: thumbnailDataUrl,
          width,
          height,
        },
        [arrayBuffer]
      );
      return;
    }

    if (req.type === 'MEDIA_ENCRYPT') {
      const { id, fileBytes } = req;
      const sodium = await getSodium();

      const mediaKey = sodium.crypto_secretstream_xchacha20poly1305_keygen();
      const initRes = sodium.crypto_secretstream_xchacha20poly1305_init_push(mediaKey);
      const header = initRes.header;
      const state = initRes.state;

      const chunkSize = 64 * 1024; // 64KB chunks
      const totalBytes = fileBytes.length;
      let offset = 0;
      const cipherChunks: Uint8Array[] = [];

      while (offset < totalBytes) {
        const end = Math.min(offset + chunkSize, totalBytes);
        const chunk = fileBytes.slice(offset, end);
        const isFinal = end >= totalBytes;
        const tag = isFinal
          ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;

        const cipherChunk = sodium.crypto_secretstream_xchacha20poly1305_push(state, chunk, null, tag);
        cipherChunks.push(cipherChunk);
        offset = end;
      }

      // Assemble encrypted payload: [header (24B) || cipher chunks]
      let totalCipherLen = header.length;
      for (const c of cipherChunks) totalCipherLen += c.length;

      const encryptedBlob = new Uint8Array(totalCipherLen);
      encryptedBlob.set(header, 0);
      let outOffset = header.length;
      for (const c of cipherChunks) {
        encryptedBlob.set(c, outOffset);
        outOffset += c.length;
      }

      self.postMessage(
        {
          id,
          success: true,
          encryptedBlob,
          keyBase64: sodium.to_base64(mediaKey),
          nonceBase64: sodium.to_base64(header),
          size: fileBytes.length,
        },
        [encryptedBlob.buffer]
      );
      return;
    }

    if (req.type === 'MEDIA_DECRYPT') {
      const { id, encryptedBytes, keyBase64 } = req;
      const sodium = await getSodium();
      const mediaKey = sodium.from_base64(keyBase64);

      const headerBytes = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;
      if (encryptedBytes.length < headerBytes) {
        throw new Error('Encrypted payload too short to contain secretstream header');
      }

      const header = encryptedBytes.slice(0, headerBytes);
      const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, mediaKey);

      const chunkSize = 64 * 1024;
      const cipherChunkSize = chunkSize + sodium.crypto_secretstream_xchacha20poly1305_ABYTES;
      let offset = headerBytes;
      const plainChunks: Uint8Array[] = [];
      let totalPlainLen = 0;

      while (offset < encryptedBytes.length) {
        const end = Math.min(offset + cipherChunkSize, encryptedBytes.length);
        const cipherChunk = encryptedBytes.slice(offset, end);
        const pullRes = sodium.crypto_secretstream_xchacha20poly1305_pull(state, cipherChunk, null);

        if (pullRes === false) {
          throw new Error('Cryptographic verification failed: ciphertext altered or corrupted');
        }

        const part = (pullRes as { message: Uint8Array }).message;
        plainChunks.push(part);
        totalPlainLen += part.length;
        offset = end;
      }

      const plaintextBytes = new Uint8Array(totalPlainLen);
      let outOffset = 0;
      for (const p of plainChunks) {
        plaintextBytes.set(p, outOffset);
        outOffset += p.length;
      }

      self.postMessage(
        {
          id,
          success: true,
          plaintextBytes,
        },
        [plaintextBytes.buffer]
      );
      return;
    }
  } catch (err: any) {
    self.postMessage({
      id: req.id,
      success: false,
      error: err.message || 'Worker task failed',
    });
  }
};
