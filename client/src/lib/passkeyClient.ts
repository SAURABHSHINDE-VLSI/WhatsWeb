import { apiRequest } from './api';

function base64UrlToBuffer(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface PasskeyInfo {
  id: string;
  credentialId: string;
  deviceName: string | null;
  transports: string | null;
  createdAt: string;
  lastUsedAt: string;
}

/**
 * Register a new Passkey / Biometric credential with the current account
 */
export async function registerPasskey(deviceName?: string): Promise<{ success: boolean }> {
  if (!isPasskeySupported()) {
    throw new Error('WebAuthn / Passkeys are not supported on this browser');
  }

  // 1. Fetch challenge & options from server
  const options = await apiRequest<{
    challenge: string;
    rp: { name: string; id: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: { type: string; alg: number }[];
    authenticatorSelection: { residentKey: string; userVerification: string };
    timeout: number;
  }>('/api/auth/passkey/register-options', { method: 'POST' });

  const challengeBytes = base64UrlToBuffer(options.challenge);
  const userBytes = base64UrlToBuffer(options.user.id);

  // 2. Call WebAuthn API to create credential
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes as unknown as BufferSource,
      rp: options.rp,
      user: {
        id: userBytes as unknown as BufferSource,
        name: options.user.name,
        displayName: options.user.displayName,
      },
      pubKeyCredParams: options.pubKeyCredParams as PublicKeyCredentialParameters[],
      authenticatorSelection: {
        residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement,
        userVerification: options.authenticatorSelection.userVerification as UserVerificationRequirement,
      },
      timeout: options.timeout,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey creation cancelled or failed');
  }

  const rawId = bufferToBase64Url(credential.rawId);
  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey ? bufferToBase64Url(response.getPublicKey() || new ArrayBuffer(0)) : rawId;

  // 3. Send verification to server
  await apiRequest('/api/auth/passkey/register-verify', {
    method: 'POST',
    body: JSON.stringify({
      challenge: options.challenge,
      credentialId: rawId,
      publicKey: publicKey || rawId,
      deviceName: deviceName || 'Biometric Passkey',
    }),
  });

  return { success: true };
}

/**
 * Authenticate (Sign in) with an existing Passkey
 */
export async function loginWithPasskey(username?: string): Promise<{
  user: any;
  accessToken: string;
  isOnboarded: boolean;
}> {
  if (!isPasskeySupported()) {
    throw new Error('WebAuthn / Passkeys are not supported on this browser');
  }

  // 1. Fetch challenge options
  const options = await apiRequest<{
    challenge: string;
    rpId: string;
    allowCredentials?: { type: string; id: string }[];
    timeout: number;
  }>('/api/auth/passkey/login-options', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });

  const challengeBytes = base64UrlToBuffer(options.challenge);

  let allowCredentials: PublicKeyCredentialDescriptor[] | undefined = undefined;
  if (options.allowCredentials && options.allowCredentials.length > 0) {
    allowCredentials = options.allowCredentials.map((c) => ({
      type: 'public-key',
      id: base64UrlToBuffer(c.id) as unknown as BufferSource,
    }));
  }

  // 2. Call WebAuthn API to get assertion
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes as unknown as BufferSource,
      rpId: options.rpId,
      allowCredentials,
      userVerification: 'preferred',
      timeout: options.timeout,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey authentication cancelled or timed out');
  }

  const credentialId = bufferToBase64Url(assertion.rawId);

  // 3. Send assertion verification to server
  const authResult = await apiRequest<{
    user: any;
    accessToken: string;
    isOnboarded: boolean;
  }>('/api/auth/passkey/login-verify', {
    method: 'POST',
    body: JSON.stringify({
      challenge: options.challenge,
      credentialId,
    }),
  });

  return authResult;
}

/**
 * List registered passkeys for current user
 */
export async function getRegisteredPasskeys(): Promise<PasskeyInfo[]> {
  const res = await apiRequest<{ credentials: PasskeyInfo[] }>('/api/auth/passkey/credentials', {
    method: 'GET',
  });
  return res.credentials;
}

/**
 * Delete a registered passkey
 */
export async function deletePasskey(id: string): Promise<void> {
  await apiRequest(`/api/auth/passkey/credentials/${id}`, {
    method: 'DELETE',
  });
}
