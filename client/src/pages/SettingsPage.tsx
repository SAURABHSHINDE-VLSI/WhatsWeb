import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Bell,
  Download,
  Shield,
  Smartphone,
  LogOut,
  Trash2,
  Lock,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../contexts/AuthContext';
import { requestAndSubscribePush, unsubscribePush } from '../lib/pushClient';
import {
  apiGetSessions,
  apiRevokeSession,
  apiLogoutOtherSessions,
  apiUpdatePrivacy,
  apiDeleteAccount,
  SessionInfo,
} from '../lib/api';

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

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleToggleNotifications = async () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    if (next) {
      await requestAndSubscribePush();
    } else {
      await unsubscribePush();
    }
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

      {/* Current Logged-in User Profile Row */}
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
                  {user.email} <span className="opacity-75">(Recovery email, private)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Settings Section */}
      <div className="px-5 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Privacy &amp; Safety
        </span>
      </div>

      <div
        className="mb-4"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="px-5 py-3 flex flex-col gap-2.5">
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
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
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
                <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
                  Only people I accepted/invited
                </p>
              </div>
            </button>
          </div>
        </div>
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

      {/* Preferences Group */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {/* Notifications Toggle */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Bell size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Notifications</span>
          </div>

          <button
            type="button"
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
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Download size={18} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--ink)' }}>
                {isInstalled ? 'App Installed' : 'Add to Home Screen'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
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
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <LogOut size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Log Out</span>
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
              <span style={{ fontSize: '15px', color: 'var(--heart)' }}>
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
