const API_BASE = '';

export const WS_BASE =
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : 'ws://localhost:3001/ws';

// In-Memory Token Storage ONLY (Fail-secure, zero token persistence in localStorage)
let currentAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export interface User {
  id: string;
  username: string | null;
  displayName: string | null;
  email?: string; // Visible only to account owner on /api/auth/me
  avatarUrl?: string | null;
  avatarTint: number;
  privacyAllowMessages: 'anyone' | 'contacts_only';
  isOnboarded: boolean;
  createdAt?: string;
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
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
  if (response.status === 401 && path !== '/api/auth/refresh' && path !== '/api/auth/google') {
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

export async function tryRefreshToken(): Promise<boolean> {
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

// 1. Health & Config
export async function apiGetHealth(): Promise<{
  status: string;
  service: string;
  googleClientId: string | null;
  timestamp: string;
}> {
  return apiRequest('/api/health');
}

// 2. Auth Endpoints
export async function apiGetAuthNonce(): Promise<{ nonce: string; expiresAt: string }> {
  return apiRequest('/api/auth/nonce');
}

export async function apiGoogleSignIn(payload: {
  idToken: string;
  nonce: string;
  deviceName?: string;
}): Promise<{
  user: User;
  accessToken: string;
  isOnboarded: boolean;
}> {
  const data = await apiRequest<{
    user: User;
    accessToken: string;
    isOnboarded: boolean;
  }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function apiOnboarding(payload: {
  username: string;
  displayName: string;
  avatarTint?: number;
}): Promise<{
  user: User;
  accessToken: string;
}> {
  const data = await apiRequest<{
    user: User;
    accessToken: string;
  }>('/api/auth/onboarding', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function apiGetMe(): Promise<{ user: User }> {
  return apiRequest('/api/auth/me');
}

export async function apiGetSessions(): Promise<{ sessions: SessionInfo[] }> {
  return apiRequest('/api/auth/sessions');
}

export async function apiRevokeSession(sessionId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function apiLogoutOtherSessions(): Promise<{ success: boolean }> {
  return apiRequest('/api/auth/logout-other-sessions', { method: 'POST' });
}

export async function apiLogout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export async function apiDeleteAccount(): Promise<{ success: boolean; message: string }> {
  try {
    return await apiRequest('/api/auth/account', { method: 'DELETE' });
  } finally {
    setAccessToken(null);
  }
}

// 3. Finding People & Contacts
export async function apiLookupUser(username: string): Promise<{
  user: User;
  isContact: boolean;
  hasPendingRequest: boolean;
  pendingRequestId?: string;
}> {
  const clean = encodeURIComponent(username.trim().replace(/^@/, ''));
  return apiRequest(`/api/users/lookup?username=${clean}`);
}

export async function apiCreateInvite(expiresInDays?: number): Promise<{
  code: string;
  expiresAt: string | null;
  createdAt: string;
}> {
  return apiRequest('/api/invites', {
    method: 'POST',
    body: JSON.stringify({ expiresInDays }),
  });
}

export async function apiGetInvite(code: string): Promise<{
  user: User;
  code: string;
  expiresAt: string | null;
}> {
  return apiRequest(`/api/invites/${encodeURIComponent(code)}`);
}

export async function apiRevokeInvite(code: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
}

// 4. Contact Requests
export interface ContactRequestItem {
  id: string;
  sender: User;
  createdAt: string;
  status: 'pending' | 'accepted' | 'ignored';
}

export async function apiGetContactRequests(): Promise<{ requests: ContactRequestItem[] }> {
  return apiRequest('/api/contacts/requests');
}

export async function apiSendContactRequest(targetUserId: string): Promise<{
  id: string;
  status: string;
  createdAt: string;
}> {
  return apiRequest('/api/contacts/request', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function apiAcceptContactRequest(requestId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/contacts/requests/${requestId}/accept`, { method: 'POST' });
}

export async function apiIgnoreContactRequest(requestId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/contacts/requests/${requestId}/ignore`, { method: 'POST' });
}

// 5. Block, Unblock, Report & Privacy
export async function apiBlockUser(targetUserId: string, reason?: string): Promise<{ success: boolean }> {
  return apiRequest('/api/contacts/block', {
    method: 'POST',
    body: JSON.stringify({ targetUserId, reason }),
  });
}

export async function apiUnblockUser(targetUserId: string): Promise<{ success: boolean }> {
  return apiRequest('/api/contacts/unblock', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function apiGetBlockedUsers(): Promise<{ blockedUsers: { id: string; user: User; blockedAt: string }[] }> {
  return apiRequest('/api/contacts/blocked');
}

export async function apiReportUser(reportedId: string, reason: string, blockAlso = false): Promise<{ success: boolean }> {
  return apiRequest('/api/contacts/report', {
    method: 'POST',
    body: JSON.stringify({ reportedId, reason, blockAlso }),
  });
}

export async function apiUpdatePrivacy(privacyAllowMessages: 'anyone' | 'contacts_only'): Promise<{ success: boolean }> {
  return apiRequest('/api/users/privacy', {
    method: 'PATCH',
    body: JSON.stringify({ privacyAllowMessages }),
  });
}

// 6. Chats & Messages
export async function apiGetChats() {
  return apiRequest<{ chats: any[] }>('/api/chats');
}

export async function apiGetMessages(partnerId: string) {
  return apiRequest<{ messages: any[] }>(`/api/chats/${partnerId}/messages`);
}

// 7. E2EE Pre-Key Bundle API
export async function apiUploadPreKeyBundle(bundle: {
  identityKey: string;
  identitySignKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: { keyId: number; publicKey: string }[];
  isReRegistration?: boolean;
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
    identitySignKey: string;
    signedPreKey: string;
    signedPreKeySignature: string;
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
    lowOpkWarning?: boolean;
  }>(`/api/keys/bundle/${userId}`);
}

// 8. Encrypted Media API
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

// 9. WebSocket Single-Use Ticket API
export async function apiGetWsTicket(): Promise<string> {
  const data = await apiRequest<{ ticket: string; expiresIn: number }>('/api/auth/ws-ticket', {
    method: 'POST',
  });
  return data.ticket;
}

// 10. Coturn Ephemeral TURN Credentials API
export async function apiGetTurnCredentials(): Promise<{
  iceServers: RTCIceServer[];
  ttl: number;
}> {
  try {
    return await apiRequest<{ iceServers: RTCIceServer[]; ttl: number }>('/api/turn-credentials');
  } catch (err) {
    // Fall back to public STUN servers if offline or error
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      ttl: 3600,
    };
  }
}
