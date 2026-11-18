import sodium from 'libsodium-wrappers';
import { argon2id } from 'hash-wasm';
import { getDB } from './db';
import { apiRequest } from './api';
import {
  exportRawKeyMaterialForBackup,
  importRawKeyMaterialFromBackup,
} from './crypto';

export interface CloudBackupInfo {
  version: number;
  sizeBytes: number;
  updatedAt: string;
}

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  messages: unknown[];
  chats: unknown[];
  keys: unknown;
}

/**
 * Derives a 32-byte symmetric key from a user passphrase using Argon2id (RFC 9106)
 */
async function deriveArgon2idKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const binaryKey = await argon2id({
    password: passphrase,
    salt,
    parallelism: 1,
    iterations: 2,
    memorySize: 65536, // 64 MB memory cost
    hashLength: 32,    // 256-bit key
    outputType: 'binary',
  });
  return binaryKey;
}

/**
 * Export local messages, chats, and cryptographic keys encrypted client-side with Argon2id
 */
export async function createEncryptedBackup(passphrase: string): Promise<{
  backupCiphertext: string;
  salt: string;
  nonce: string;
  sizeBytes: number;
}> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Recovery passphrase must be at least 8 characters long');
  }

  await sodium.ready;
  const db = await getDB();
  const messages = await db.getAll('messages');
  const chats = await db.getAll('chats');
  const keys = await exportRawKeyMaterialForBackup();

  const bundle: BackupBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    messages,
    chats,
    keys,
  };

  const payloadString = JSON.stringify(bundle);
  const payloadBytes = sodium.from_string(payloadString);

  // Generate 16-byte random salt and 24-byte nonce
  const salt = sodium.randombytes_buf(16);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // Derive Argon2id key
  const key = await deriveArgon2idKey(passphrase, salt);

  let ciphertext: Uint8Array;
  try {
    ciphertext = sodium.crypto_secretbox_easy(payloadBytes, nonce, key);
  } finally {
    // Zero sensitive key from memory
    sodium.memzero(key);
  }

  const backupCiphertext = sodium.to_base64(ciphertext);
  const saltBase64 = sodium.to_base64(salt);
  const nonceBase64 = sodium.to_base64(nonce);

  return {
    backupCiphertext,
    salt: saltBase64,
    nonce: nonceBase64,
    sizeBytes: ciphertext.byteLength,
  };
}

/**
 * Upload encrypted backup to server cloud storage (Zero server plaintext)
 */
export async function uploadEncryptedBackup(passphrase: string): Promise<CloudBackupInfo> {
  const backup = await createEncryptedBackup(passphrase);

  const res = await apiRequest<{
    success: boolean;
    version: number;
    sizeBytes: number;
    updatedAt: string;
  }>('/api/backup', {
    method: 'POST',
    body: JSON.stringify({
      backupCiphertext: backup.backupCiphertext,
      salt: backup.salt,
      nonce: backup.nonce,
      version: 1,
    }),
  });

  return {
    version: res.version,
    sizeBytes: res.sizeBytes,
    updatedAt: res.updatedAt,
  };
}

/**
 * Download cloud backup metadata
 */
export async function getCloudBackupInfo(): Promise<CloudBackupInfo | null> {
  const res = await apiRequest<{
    backup: {
      backupCiphertext: string;
      salt: string;
      nonce: string;
      version: number;
      sizeBytes: number;
      updatedAt: string;
    } | null;
  }>('/api/backup', { method: 'GET' });

  if (!res.backup) return null;

  return {
    version: res.backup.version,
    sizeBytes: res.backup.sizeBytes,
    updatedAt: res.backup.updatedAt,
  };
}

/**
 * Delete cloud backup from server
 */
export async function deleteCloudBackup(): Promise<void> {
  await apiRequest('/api/backup', { method: 'DELETE' });
}

/**
 * Restore conversations and keys from an Argon2id-encrypted backup
 */
export async function restoreEncryptedBackup(
  passphrase: string,
  backupData?: { backupCiphertext: string; salt: string; nonce: string }
): Promise<{
  restoredMessages: number;
  restoredChats: number;
  exportedAt: string;
}> {
  if (!passphrase) {
    throw new Error('Recovery passphrase is required');
  }

  await sodium.ready;

  let payload = backupData;
  if (!payload) {
    const res = await apiRequest<{
      backup: {
        backupCiphertext: string;
        salt: string;
        nonce: string;
        version: number;
      } | null;
    }>('/api/backup', { method: 'GET' });

    if (!res.backup) {
      throw new Error('No backup found on cloud server');
    }
    payload = res.backup;
  }

  const salt = sodium.from_base64(payload.salt);
  const nonce = sodium.from_base64(payload.nonce);
  const ciphertext = sodium.from_base64(payload.backupCiphertext);

  const key = await deriveArgon2idKey(passphrase, salt);

  let decryptedBytes: Uint8Array;
  try {
    const openRes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    if (!openRes) {
      throw new Error('Invalid recovery passphrase or corrupted backup.');
    }
    decryptedBytes = openRes;
  } catch (err) {
    throw new Error('Invalid recovery passphrase or corrupted backup.');
  } finally {
    sodium.memzero(key);
  }

  const bundleString = sodium.to_string(decryptedBytes);
  const bundle: BackupBundle = JSON.parse(bundleString);

  // Restore messages and chats into IndexedDB
  const db = await getDB();
  let msgCount = 0;
  if (bundle.messages && Array.isArray(bundle.messages)) {
    const tx = db.transaction('messages', 'readwrite');
    for (const m of bundle.messages) {
      await tx.store.put(m as any);
      msgCount++;
    }
    await tx.done;
  }

  let chatCount = 0;
  if (bundle.chats && Array.isArray(bundle.chats)) {
    const tx = db.transaction('chats', 'readwrite');
    for (const c of bundle.chats) {
      await tx.store.put(c as any);
      chatCount++;
    }
    await tx.done;
  }

  // Restore cryptographic keys if present
  if (bundle.keys) {
    await importRawKeyMaterialFromBackup(bundle.keys as any);
  }

  return {
    restoredMessages: msgCount,
    restoredChats: chatCount,
    exportedAt: bundle.exportedAt,
  };
}

/**
 * Triggers browser file download of local encrypted backup (.whatsus.enc)
 */
export function downloadBackupFile(
  backup: { backupCiphertext: string; salt: string; nonce: string },
  filename = 'whatsus-backup.enc'
) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
