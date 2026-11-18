import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Bell,
  Download,
  Smartphone,
  LogOut,
  Trash2,
  Check,
  AlertTriangle,
  FileDown,
  UserX,
  ExternalLink,
  CheckCheck,
  Fingerprint,
  Lock,
  Shield,
  Share2,
  Cloud,
  CloudDownload,
  Key,
  X,
  Plus,
} from 'lucide-react';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../contexts/AuthContext';
import { useAppLock } from '../contexts/AppLockContext';
import { requestAndSubscribePush, unsubscribePush } from '../lib/pushClient';
import {
  getRegisteredPasskeys,
  registerPasskey,
  deletePasskey,
  PasskeyInfo,
  isPasskeySupported,
} from '../lib/passkeyClient';
import {
  uploadEncryptedBackup,
  restoreEncryptedBackup,
  getCloudBackupInfo,
  deleteCloudBackup,
  createEncryptedBackup,
  downloadBackupFile,
  CloudBackupInfo,
} from '../lib/backup';
import {
  apiGetSessions,
  apiRevokeSession,
  apiLogoutOtherSessions,
  apiUpdatePrivacy,
  apiDeleteAccount,
  apiGetBlockedUsers,
  apiUnblockUser,
  SessionInfo,
  User,
} from '../lib/api';
import { getDB } from '../lib/db';

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout, refreshProfile } = useAuth();
  const { canInstall, promptInstall, isInstalled } = usePWAInstall();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<'anyone' | 'contacts_only'>(
    user?.privacyAllowMessages || 'anyone'
  );
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Phase B Settings
  const [linkPreviewsEnabled, setLinkPreviewsEnabled] = useState(() => {
    return localStorage.getItem('whatsus_feature_link_previews') === 'true';
  });

  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(() => {
    return localStorage.getItem('whatsus_read_receipts') !== 'false';
  });

  const [blockedUsers, setBlockedUsers] = useState<{ id: string; user: User; blockedAt: string }[]>([]);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Phase D States: App Lock, Passkeys, Backup
  const {
    isAppLockEnabled,
    hasPin,
    useBiometrics,
    lockTimeoutMs,
    lockNow,
    enableAppLock,
    disableAppLock,
    updateTimeout,
  } = useAppLock();

  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [cloudBackup, setCloudBackup] = useState<CloudBackupInfo | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showAppLockModal, setShowAppLockModal] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [appLockPin, setAppLockPin] = useState('');
  const [appLockBiometrics, setAppLockBiometrics] = useState(true);
  const [appLockTimeoutVal, setAppLockTimeoutVal] = useState(lockTimeoutMs);
  const [backupStatusMsg, setBackupStatusMsg] = useState('');
  const [backupError, setBackupError] = useState('');
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  const themeOptions: { label: string; value: ThemePreference }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await apiGetSessions();
      setSessions(res.sessions);
    } catch (err) {
      console.error('Failed to load sessions', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const fetchBlocked = useCallback(async () => {
    try {
      const res = await apiGetBlockedUsers();
      setBlockedUsers(res.blockedUsers);
    } catch (err) {
      console.error('Failed to load blocked users', err);
    }
  }, []);

  const fetchPasskeys = useCallback(async () => {
    if (!isPasskeySupported()) return;
    try {
      const p = await getRegisteredPasskeys();
      setPasskeys(p);
    } catch (err) {
      console.error('Failed to load passkeys', err);
    }
  }, []);

  const fetchCloudBackup = useCallback(async () => {
    try {
      const b = await getCloudBackupInfo();
      setCloudBackup(b);
    } catch (err) {
      console.error('Failed to load cloud backup info', err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchBlocked();
    fetchPasskeys();
    fetchCloudBackup();
  }, [fetchSessions, fetchBlocked, fetchPasskeys, fetchCloudBackup]);

  // Passkey Handlers
  const handleRegisterPasskey = async () => {
    setIsRegisteringPasskey(true);
    try {
      await registerPasskey();
      await fetchPasskeys();
    } catch (err: any) {
      alert(err.message || 'Failed to register passkey');
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!window.confirm('Remove this passkey?')) return;
    try {
      await deletePasskey(id);
      await fetchPasskeys();
    } catch (err: any) {
      alert(err.message || 'Failed to remove passkey');
    }
  };

  // App Lock Handlers
  const handleToggleAppLock = () => {
    if (isAppLockEnabled) {
      const pin = window.prompt('Enter your current PIN to turn off App Lock:');
      if (!pin) return;
      const ok = disableAppLock(pin);
      if (!ok) {
        alert('Incorrect PIN');
      }
    } else {
      setAppLockPin('');
      setAppLockBiometrics(true);
      setShowAppLockModal(true);
    }
  };

  const handleSaveAppLock = async () => {
    if (appLockPin.length < 4) {
      alert('PIN must be at least 4 digits');
      return;
    }
    await enableAppLock(appLockPin, appLockBiometrics, appLockTimeoutVal);
    setShowAppLockModal(false);
    setAppLockPin('');
  };

  // Backup Handlers
  const handlePerformCloudBackup = async () => {
    if (!backupPassphrase || backupPassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters');
      return;
    }
    setBackupError('');
    setIsProcessingBackup(true);
    setBackupStatusMsg('Deriving Argon2id key and encrypting...');
    try {
      const info = await uploadEncryptedBackup(backupPassphrase);
      setCloudBackup(info);
      setBackupStatusMsg('Encrypted backup successfully uploaded to cloud!');
      setTimeout(() => {
        setShowBackupModal(false);
        setBackupPassphrase('');
        setBackupStatusMsg('');
      }, 1500);
    } catch (err: any) {
      setBackupError(err.message || 'Backup failed');
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const handlePerformLocalBackupDownload = async () => {
    if (!backupPassphrase || backupPassphrase.length < 8) {
      setBackupError('Passphrase must be at least 8 characters');
      return;
    }
    setBackupError('');
    setIsProcessingBackup(true);
    setBackupStatusMsg('Deriving Argon2id key and generating encrypted file...');
    try {
      const backup = await createEncryptedBackup(backupPassphrase);
      downloadBackupFile(backup, `whatsus-backup-${user?.username || 'user'}-${Date.now()}.whatsus.enc`);
      setBackupStatusMsg('Local encrypted backup file downloaded!');
      setTimeout(() => {
        setShowBackupModal(false);
        setBackupPassphrase('');
        setBackupStatusMsg('');
      }, 1500);
    } catch (err: any) {
      setBackupError(err.message || 'Local backup creation failed');
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const handlePerformRestore = async (localData?: { backupCiphertext: string; salt: string; nonce: string }) => {
    if (!restorePassphrase) {
      setBackupError('Passphrase is required');
      return;
    }
    setBackupError('');
    setIsProcessingBackup(true);
    setBackupStatusMsg('Deriving key and decrypting backup...');
    try {
      const res = await restoreEncryptedBackup(restorePassphrase, localData);
      setBackupStatusMsg(`Restored ${res.restoredMessages} messages across ${res.restoredChats} chats!`);
      setTimeout(() => {
        setShowRestoreModal(false);
        setRestorePassphrase('');
        setBackupStatusMsg('');
      }, 1800);
    } catch (err: any) {
      setBackupError(err.message || 'Restore failed. Check passphrase or file.');
    } finally {
      setIsProcessingBackup(false);
    }
  };

  const handleRestoreFromFilePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.backupCiphertext || !parsed.salt || !parsed.nonce) {
          throw new Error('Selected file is not a valid WhatsUs encrypted backup');
        }
        await handlePerformRestore(parsed);
      } catch (err: any) {
        setBackupError(err.message || 'Failed to read backup file');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteCloudBackup = async () => {
    if (!window.confirm('Permanently delete your cloud backup? This action cannot be undone.')) return;
    try {
      await deleteCloudBackup();
      setCloudBackup(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete backup');
    }
  };

  const handleShareApp = async () => {
    const inviteUrl = window.location.origin;
    const text = `Chat with me on WhatsUs E2EE Messenger! My username is @${user?.username || ''}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WhatsUs Messenger',
          text,
          url: inviteUrl,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n${inviteUrl}`);
      alert('Invite link copied to clipboard!');
    }
  };

  const handleToggleNotifications = async () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    if (next) {
      await requestAndSubscribePush();
    } else {
      await unsubscribePush();
    }
  };

  const handleToggleLinkPreviews = () => {
    const next = !linkPreviewsEnabled;
    setLinkPreviewsEnabled(next);
    localStorage.setItem('whatsus_feature_link_previews', String(next));
  };

  const handleToggleReadReceipts = () => {
    const next = !readReceiptsEnabled;
    setReadReceiptsEnabled(next);
    localStorage.setItem('whatsus_read_receipts', String(next));
  };

  const handleInstallClick = async () => {
    if (canInstall) {
      await promptInstall();
    }
  };

  const handlePrivacyToggle = async (mode: 'anyone' | 'contacts_only') => {
    if (mode === privacyMode || isUpdatingPrivacy) return;
    setIsUpdatingPrivacy(true);
    try {
      await apiUpdatePrivacy(mode);
      setPrivacyMode(mode);
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update privacy setting', err);
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiRevokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to revoke session', err);
    }
  };

  const handleLogoutOtherDevices = async () => {
    if (!window.confirm('Log out of all other active browser sessions?')) return;
    try {
      await apiLogoutOtherSessions();
      await fetchSessions();
    } catch (err) {
      console.error('Failed to log out other sessions', err);
    }
  };

  const handleUnblock = async (targetUserId: string) => {
    try {
      await apiUnblockUser(targetUserId);
      setBlockedUsers((prev) => prev.filter((b) => b.user.id !== targetUserId));
    } catch (err) {
      console.error('Failed to unblock user', err);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const db = await getDB();
      const chats = await db.getAll('chats');
      const messages = await db.getAll('messages');

      const exportPayload = {
        exportDate: new Date().toISOString(),
        application: 'WhatsUs E2EE Messenger',
        version: '1.0',
        user: {
          id: user?.id,
          username: user?.username,
          displayName: user?.displayName,
          email: user?.email,
        },
        chatsCount: chats.length,
        messagesCount: messages.length,
        chats,
        messages: messages.map((m) => ({
          id: m.id,
          partnerId: m.partnerId,
          content: m.content,
          type: m.type,
          createdAt: m.createdAt,
          isSent: m.isSent,
          isEdited: m.isEdited,
          isStarred: m.isStarred,
        })),
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsus_data_export_${user?.username || 'account'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Error reading local database'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    const prompt = window.prompt(
      'Are you sure you want to permanently delete your account? This will erase all conversations, cryptographic keys, and sessions.\n\nType your @username to confirm:'
    );
    if (!prompt || prompt.toLowerCase().trim() !== user?.username?.toLowerCase().trim()) {
      return;
    }

    setIsDeleting(true);
    try {
      await apiDeleteAccount();
      navigate('/login');
    } catch (err: any) {
      alert(err.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  const userInitials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="flex flex-col min-h-full pb-20 select-none" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Blocked Users Modal */}
      {showBlockedModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowBlockedModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95 max-h-[80vh]"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Blocked Contacts</h3>
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                className="text-xs px-2 py-1 rounded hover:bg-black/5"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
              {blockedUsers.length === 0 ? (
                <div className="py-8 text-center text-xs opacity-60">
                  No blocked contacts.
                </div>
              ) : (
                blockedUsers.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <div>
                      <div className="text-xs font-semibold">{b.user.displayName || b.user.username}</div>
                      <div className="text-[11px] font-mono opacity-70">@{b.user.username}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnblock(b.user.id)}
                      className="px-2.5 py-1 text-xs rounded-lg font-medium border hover:bg-black/5"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* App Lock Configuration Modal */}
      {showAppLockModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="App Lock Configuration"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowAppLockModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={18} style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold">Configure App Lock</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAppLockModal(false)}
                className="text-xs px-2 py-1 rounded hover:bg-black/5"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs opacity-75 leading-relaxed">
              Require a PIN or biometric authentication to open WhatsUs. Background previews are obscured in the app switcher.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Set 4-8 Digit PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={appLockPin}
                  onChange={(e) => setAppLockPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 4-8 digits"
                  className="w-full px-3 py-2 text-sm rounded-xl border tracking-widest font-mono text-center focus:outline-none"
                  style={{
                    backgroundColor: 'var(--bg)',
                    borderColor: 'var(--line)',
                    color: 'var(--ink)',
                  }}
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl border" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2">
                  <Fingerprint size={16} style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-medium">Use Biometrics (Face / Touch ID)</span>
                </div>
                <input
                  type="checkbox"
                  checked={appLockBiometrics}
                  onChange={(e) => setAppLockBiometrics(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Auto-Lock Inactivity Timeout</label>
                <select
                  value={appLockTimeoutVal}
                  onChange={(e) => setAppLockTimeoutVal(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none"
                  style={{
                    backgroundColor: 'var(--bg)',
                    borderColor: 'var(--line)',
                    color: 'var(--ink)',
                  }}
                >
                  <option value={0}>Immediately upon switching away</option>
                  <option value={60000}>After 1 minute</option>
                  <option value={300000}>After 5 minutes</option>
                  <option value={900000}>After 15 minutes</option>
                  <option value={3600000}>After 1 hour</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveAppLock}
              disabled={appLockPin.length < 4}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-opacity"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              Enable App Lock
            </button>
          </div>
        </div>
      )}

      {/* Encrypted Backup Creation Modal */}
      {showBackupModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Encrypted Backup"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => !isProcessingBackup && setShowBackupModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold">Create Encrypted Backup</h3>
              </div>
              <button
                type="button"
                disabled={isProcessingBackup}
                onClick={() => setShowBackupModal(false)}
                className="text-xs px-2 py-1 rounded hover:bg-black/5"
              >
                Close
              </button>
            </div>

            <p className="text-xs opacity-75 leading-relaxed">
              Your messages, contacts, and Double Ratchet keys are encrypted locally using <strong>Argon2id</strong> (RFC 9106) and 256-bit XChaCha20-Poly1305 before transmission.
            </p>

            <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed">
              <strong>Zero-Knowledge Notice:</strong> WhatsUs cannot reset or recover this passphrase. If lost, your backup is permanently unrecoverable.
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium">Recovery Passphrase (min 8 chars)</label>
              <input
                type="password"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="Enter strong passphrase"
                className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg)',
                  borderColor: 'var(--line)',
                  color: 'var(--ink)',
                }}
              />
            </div>

            {backupError && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded-lg font-medium">
                {backupError}
              </div>
            )}

            {backupStatusMsg && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded-lg font-medium">
                {backupStatusMsg}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={isProcessingBackup || backupPassphrase.length < 8}
                onClick={handlePerformCloudBackup}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-ink)',
                }}
              >
                <Cloud size={16} />
                <span>Upload Encrypted Cloud Backup</span>
              </button>

              <button
                type="button"
                disabled={isProcessingBackup || backupPassphrase.length < 8}
                onClick={handlePerformLocalBackupDownload}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 border flex items-center justify-center gap-2 hover:bg-black/5"
                style={{
                  borderColor: 'var(--line)',
                  color: 'var(--ink)',
                }}
              >
                <Download size={16} />
                <span>Download .whatsus.enc File</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Encrypted Backup Modal */}
      {showRestoreModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Restore Encrypted Backup"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => !isProcessingBackup && setShowRestoreModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudDownload size={18} style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold">Restore Encrypted Backup</h3>
              </div>
              <button
                type="button"
                disabled={isProcessingBackup}
                onClick={() => setShowRestoreModal(false)}
                className="text-xs px-2 py-1 rounded hover:bg-black/5"
              >
                Close
              </button>
            </div>

            <p className="text-xs opacity-75 leading-relaxed">
              Enter your recovery passphrase to derive the Argon2id key and decrypt your messages, chats, and keys.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-medium">Recovery Passphrase</label>
              <input
                type="password"
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
                placeholder="Enter passphrase used when backed up"
                className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg)',
                  borderColor: 'var(--line)',
                  color: 'var(--ink)',
                }}
              />
            </div>

            {backupError && (
              <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded-lg font-medium">
                {backupError}
              </div>
            )}

            {backupStatusMsg && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded-lg font-medium">
                {backupStatusMsg}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {cloudBackup ? (
                <button
                  type="button"
                  disabled={isProcessingBackup || !restorePassphrase}
                  onClick={() => handlePerformRestore()}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  <CloudDownload size={16} />
                  <span>Restore from Cloud ({Math.round(cloudBackup.sizeBytes / 1024)} KB)</span>
                </button>
              ) : (
                <div className="text-xs opacity-60 text-center py-1">No cloud backup found on server.</div>
              )}

              <div className="relative border-t my-1 pt-2" style={{ borderColor: 'var(--line)' }}>
                <span className="block text-[11px] font-semibold mb-1 opacity-80">Or restore from local file (.enc):</span>
                <input
                  type="file"
                  accept=".enc,.json"
                  disabled={isProcessingBackup || !restorePassphrase}
                  onChange={handleRestoreFromFilePicker}
                  className="w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border file:text-xs file:font-medium file:cursor-pointer hover:file:bg-black/5"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="px-5 pt-4 pb-2 pt-safe">
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-title)',
            letterSpacing: '-0.02em',
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.15,
          }}
        >
          Settings
        </h1>
      </header>

      {/* Theme Segment Switcher */}
      <div className="px-5 my-3">
        <div
          className="flex p-1 gap-1"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {themeOptions.map((opt) => {
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className="flex-1 py-2 text-center text-xs transition-all cursor-pointer"
                style={{
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'var(--bg)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: isActive ? 600 : 500,
                  boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current User Row */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: `var(--tint-${((user?.avatarTint || 0) % 4) + 1}, #D9CDB8)`,
                color: '#1D1B18',
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              {userInitials}
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '16px',
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                {user?.displayName || 'User'}
              </div>
              <div className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                @{user?.username || 'handle'}
              </div>
              {user?.email && (
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
                  {user.email} <span>(Recovery email, private)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Settings Section */}
      <div className="px-5 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Privacy &amp; Permissions
        </span>
      </div>

      <div
        className="mb-4"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Message Permissions: Anyone vs Contacts Only */}
        <div className="px-5 py-3 flex flex-col gap-2.5 border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
            Who can message me
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isUpdatingPrivacy}
              onClick={() => handlePrivacyToggle('anyone')}
              className="flex-1 p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
              style={{
                backgroundColor: privacyMode === 'anyone' ? 'var(--surface-2)' : 'var(--surface-1)',
                borderColor: privacyMode === 'anyone' ? 'var(--accent)' : 'var(--line)',
              }}
            >
              <div className="mt-0.5">
                {privacyMode === 'anyone' ? (
                  <Check size={14} style={{ color: 'var(--accent)' }} />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-gray-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  Anyone
                </p>
                <p className="text-[11px]" style={{ color: privacyMode === 'anyone' ? 'var(--ink)' : 'var(--muted)' }}>
                  Strangers land in Requests
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={isUpdatingPrivacy}
              onClick={() => handlePrivacyToggle('contacts_only')}
              className="flex-1 p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
              style={{
                backgroundColor: privacyMode === 'contacts_only' ? 'var(--surface-2)' : 'var(--surface-1)',
                borderColor: privacyMode === 'contacts_only' ? 'var(--accent)' : 'var(--line)',
              }}
            >
              <div className="mt-0.5">
                {privacyMode === 'contacts_only' ? (
                  <Check size={14} style={{ color: 'var(--accent)' }} />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-gray-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  Contacts Only
                </p>
                <p className="text-[11px]" style={{ color: privacyMode === 'contacts_only' ? 'var(--ink)' : 'var(--muted)' }}>
                  Only accepted/invited
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Link Previews Feature Flag Toggle (Default OFF) */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <ExternalLink size={18} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>Link Previews</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Feature flag (Off in v1 to prevent IP/URL leakage via proxy)
              </div>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={linkPreviewsEnabled}
            aria-label="Link Previews toggle"
            onClick={handleToggleLinkPreviews}
            className="w-11 h-6 rounded-full relative transition-colors cursor-pointer"
            style={{
              backgroundColor: linkPreviewsEnabled ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span
              className="block w-5 h-5 rounded-full transition-transform absolute top-0.5 left-0.5"
              style={{
                backgroundColor: 'var(--accent-ink)',
                transform: linkPreviewsEnabled ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {/* Read Receipts Toggle */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <CheckCheck size={18} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>Read Receipts</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Show double checkmarks when messages are read
              </div>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={readReceiptsEnabled}
            aria-label="Read Receipts toggle"
            onClick={handleToggleReadReceipts}
            className="w-11 h-6 rounded-full relative transition-colors cursor-pointer"
            style={{
              backgroundColor: readReceiptsEnabled ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span
              className="block w-5 h-5 rounded-full transition-transform absolute top-0.5 left-0.5"
              style={{
                backgroundColor: 'var(--accent-ink)',
                transform: readReceiptsEnabled ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {/* Blocked Users */}
        <div
          onClick={() => setShowBlockedModal(true)}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UserX size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '14px', color: 'var(--ink)' }}>
              Blocked Contacts ({blockedUsers.length})
            </span>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* Security & Passkeys */}
      <div className="px-5 mt-4 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Security &amp; Passkeys
        </span>
      </div>

      <div
        className="mb-4"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Passkeys Header / Action */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-3">
            <Fingerprint size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>Passkeys &amp; Biometrics</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Sign in with Touch ID, Face ID, or Windows Hello
              </div>
            </div>
          </div>
          {isPasskeySupported() && (
            <button
              type="button"
              disabled={isRegisteringPasskey}
              onClick={handleRegisterPasskey}
              className="px-2.5 py-1 text-xs rounded-lg font-medium border flex items-center gap-1 cursor-pointer hover:bg-black/5 disabled:opacity-50"
              style={{ borderColor: 'var(--line)', color: 'var(--accent)' }}
            >
              <Plus size={13} />
              <span>{isRegisteringPasskey ? 'Registering...' : 'Add Passkey'}</span>
            </button>
          )}
        </div>

        {/* Passkeys List */}
        {passkeys.length > 0 && (
          <div className="border-b" style={{ borderColor: 'var(--line)' }}>
            {passkeys.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-5 py-2.5 bg-black/2 border-b last:border-b-0"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex items-center gap-2.5">
                  <Key size={15} style={{ color: 'var(--muted)' }} />
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                      {p.deviceName || 'Biometric Passkey'}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                      Registered {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePasskey(p.id)}
                  className="p-1 rounded text-xs hover:bg-red-500/10 cursor-pointer"
                  style={{ color: 'var(--heart)' }}
                  title="Remove Passkey"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* App Lock Row */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Lock size={18} style={{ color: isAppLockEnabled ? 'var(--accent)' : 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>App Lock</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {isAppLockEnabled
                  ? `Enabled • Auto-locks ${lockTimeoutMs === 0 ? 'immediately' : `in ${lockTimeoutMs / 60000}m`}`
                  : 'Require PIN or biometrics to open'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAppLockEnabled && (
              <button
                type="button"
                onClick={lockNow}
                className="px-2 py-0.5 text-[11px] rounded font-medium border hover:bg-black/5 cursor-pointer"
                style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
              >
                Lock Now
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={isAppLockEnabled}
              aria-label="App Lock toggle"
              onClick={handleToggleAppLock}
              className="w-11 h-6 rounded-full relative transition-colors cursor-pointer"
              style={{
                backgroundColor: isAppLockEnabled ? 'var(--accent)' : 'var(--line)',
              }}
            >
              <span
                className="block w-5 h-5 rounded-full transition-transform absolute top-0.5 left-0.5"
                style={{
                  backgroundColor: 'var(--accent-ink)',
                  transform: isAppLockEnabled ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* End-to-End Encrypted Backup */}
      <div className="px-5 mt-4 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          End-to-End Encrypted Backup
        </span>
      </div>

      <div
        className="mb-4"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Backup Status Overview */}
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-3">
            <Cloud size={18} style={{ color: cloudBackup ? 'var(--accent)' : 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>
                {cloudBackup ? 'Encrypted Cloud Backup Active' : 'No Cloud Backup'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {cloudBackup
                  ? `${Math.round(cloudBackup.sizeBytes / 1024)} KB • Last updated ${new Date(
                      cloudBackup.updatedAt
                    ).toLocaleDateString()}`
                  : 'Encrypted client-side with Argon2id before leaving device'}
              </div>
            </div>
          </div>
        </div>

        {/* Back Up Now */}
        <div
          onClick={() => {
            setBackupError('');
            setBackupStatusMsg('');
            setShowBackupModal(true);
          }}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>Back Up Now</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Create encrypted snapshot with your recovery passphrase
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {/* Restore Backup */}
        <div
          onClick={() => {
            setBackupError('');
            setBackupStatusMsg('');
            setShowRestoreModal(true);
          }}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <CloudDownload size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>Restore Conversations &amp; Keys</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Restore from cloud or local .whatsus.enc file
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {/* Delete Cloud Backup */}
        {cloudBackup && (
          <div
            onClick={handleDeleteCloudBackup}
            className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-red-500/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 size={16} style={{ color: 'var(--heart)' }} />
              <div style={{ fontSize: '13px', color: 'var(--heart)' }}>Delete Cloud Backup</div>
            </div>
          </div>
        )}
      </div>

      {/* Active Sessions Management */}
      <div className="px-5 mt-2 mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Active Sessions ({sessions.length})
        </span>
        {sessions.length > 1 && (
          <button
            type="button"
            onClick={handleLogoutOtherDevices}
            className="text-xs font-medium cursor-pointer hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Log out other devices
          </button>
        )}
      </div>

      <div
        className="mb-4"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {isLoadingSessions ? (
          <div className="p-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-center" style={{ color: 'var(--muted)' }}>
            No other active sessions.
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-5 py-3 border-b last:border-b-0"
              style={{ borderColor: 'var(--line)' }}
            >
              <div className="flex items-center gap-3">
                <Smartphone size={18} style={{ color: s.isCurrent ? 'var(--accent)' : 'var(--muted)' }} />
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                    <span>{s.deviceName || 'Web Browser'}</span>
                    {s.isCurrent && (
                      <span
                        className="px-1.5 py-0.2 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--surface-2)', color: 'var(--accent)' }}
                      >
                        Current Device
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                    {s.ipAddress || 'Unknown IP'} • Active {new Date(s.lastUsedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {!s.isCurrent && (
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.id)}
                  className="text-xs p-1.5 rounded-lg cursor-pointer hover:bg-black/5"
                  style={{ color: 'var(--heart)' }}
                  title="Revoke session"
                >
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Data & Preferences Group */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Invite Friends */}
        <div
          onClick={handleShareApp}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Share2 size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>Invite Friends</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Share your @handle and link via native share sheet
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {/* Export Data */}
        <div
          onClick={handleExportData}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <FileDown size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>
                {isExporting ? 'Exporting...' : 'Export Local Data'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Download your decrypted conversations and contact list as JSON
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {/* Notifications Toggle */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Bell size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '14px', color: 'var(--ink)' }}>Notifications</span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={notificationsEnabled}
            aria-label="Notifications toggle"
            onClick={handleToggleNotifications}
            className="w-11 h-6 rounded-full relative transition-colors cursor-pointer"
            style={{
              backgroundColor: notificationsEnabled ? 'var(--accent)' : 'var(--line)',
            }}
          >
            <span
              className="block w-5 h-5 rounded-full transition-transform absolute top-0.5 left-0.5"
              style={{
                backgroundColor: 'var(--accent-ink)',
                transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>

        {/* PWA Install */}
        <div
          onClick={handleInstallClick}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Download size={18} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '14px', color: 'var(--ink)' }}>
                {isInstalled ? 'App Installed' : 'Add to Home Screen'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {isInstalled ? 'Running as standalone application' : 'Install standalone app'}
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* Account Actions */}
      <div
        className="my-3"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Log Out */}
        <div
          onClick={logout}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <LogOut size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '14px', color: 'var(--ink)' }}>Log Out</span>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>

        {/* Delete Account */}
        <div
          onClick={handleDeleteAccount}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-red-500/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trash2 size={18} style={{ color: 'var(--heart)' }} />
            <div>
              <span style={{ fontSize: '14px', color: 'var(--heart)' }}>
                {isDeleting ? 'Erasing Account...' : 'Delete Account'}
              </span>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                Wipes all messages, sessions, and reserves handle for 30 days
              </p>
            </div>
          </div>
          <AlertTriangle size={16} style={{ color: 'var(--heart)' }} />
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
