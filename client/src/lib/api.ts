const API_BASE = '';

export const WS_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : 'ws://localhost:3001/ws';

let currentAccessToken: string | null = null;

if (typeof window !== 'undefined') {
  currentAccessToken = localStorage.getItem('editorial_access_token');
}

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('editorial_access_token', token);
    } else {
      localStorage.removeItem('editorial_access_token');
    }
  }
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (currentAccessToken) {
    headers.set('Authorization', `Bearer ${currentAccessToken}`);
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Attempt refresh if 401
  if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${currentAccessToken}`);
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = await res.json();
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return true;
    }
  } catch (err) {
    setAccessToken(null);
  }
  return false;
}

// Auth API
export async function apiLogin(username: string, password: string) {
  const data = await apiRequest<{ user: any; accessToken: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function apiRegister(payload: {
  username: string;
  password: string;
  displayName: string;
  phoneNumber?: string;
  avatarTint?: number;
}) {
  const data = await apiRequest<{ user: any; accessToken: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function apiGetMe() {
  return apiRequest<{ user: any }>('/api/auth/me');
}

export async function apiLogout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

// Chats & Messages API
export async function apiGetChats() {
  return apiRequest<{ chats: any[] }>('/api/chats');
}

export async function apiGetMessages(partnerId: string) {
  return apiRequest<{ messages: any[] }>(`/api/chats/${partnerId}/messages`);
}

export async function apiGetUsers() {
  return apiRequest<{ users: any[] }>('/api/users');
}

// E2EE Pre-Key Bundle & Audit API
export async function apiUploadPreKeyBundle(bundle: {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: { keyId: number; publicKey: string }[];
}) {
  return apiRequest('/api/keys/bundle', {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
}

export async function apiFetchPreKeyBundle(userId: string) {
  return apiRequest<{
    userId: string;
    identityKey: string;
    signedPreKey: string;
    signedPreKeySignature: string;
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
  }>(`/api/keys/bundle/${userId}`);
}

// Encrypted Media API
export async function apiUploadEncryptedMedia(blob: Blob): Promise<{ fileId: string; mediaUrl: string }> {
  const formData = new FormData();
  formData.append('file', blob, 'media.enc');

  const headers: Record<string, string> = {};
  if (currentAccessToken) {
    headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }

  const res = await fetch(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Media upload failed with status ${res.status}`);
  }

  return res.json();
}

export async function apiDownloadEncryptedMedia(mediaUrl: string): Promise<Uint8Array> {
  const url = mediaUrl.startsWith('http') ? mediaUrl : `${API_BASE}${mediaUrl}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to download encrypted media with status ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
