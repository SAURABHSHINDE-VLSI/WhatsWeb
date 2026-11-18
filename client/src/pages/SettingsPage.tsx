import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, Download, HardDrive, Shield, Users, LogOut } from 'lucide-react';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../contexts/AuthContext';
import { requestAndSubscribePush, unsubscribePush } from '../lib/pushClient';

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, switchUser, logout } = useAuth();
  const { canInstall, promptInstall, isIOS, isInstalled } = usePWAInstall();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showInstallAlert, setShowInstallAlert] = useState(false);

  const themeOptions: { label: string; value: ThemePreference }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

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
    } else {
      setShowInstallAlert(true);
    }
  };

  const demoAccounts = [
    { username: 'alex', name: 'Alex Mercer', initials: 'AM', tint: 'tint-1' },
    { username: 'maya', name: 'Maya Lin', initials: 'ML', tint: 'tint-2' },
    { username: 'julian', name: 'Julian Vance', initials: 'JV', tint: 'tint-3' },
    { username: 'amara', name: 'Amara Rao', initials: 'AR', tint: 'tint-4' },
  ];

  const userInitials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'AM';

  return (
    <div className="flex flex-col min-h-full pb-20" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
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
        className="my-3 cursor-pointer"
        onClick={() => navigate('/profile/me')}
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
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--tint-1)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-serif)',
                fontSize: '15px',
                fontWeight: 500,
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
                {user?.displayName || 'Alex Mercer'}
              </div>
              <div className="tnum" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {user?.phoneNumber || '@' + (user?.username || 'alex')}
              </div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* Multi-User Switcher for Real-Time Testing */}
      <div className="px-5 my-2">
        <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          <Users size={14} />
          <span className="font-medium">Active Account (Tap to switch &amp; test real-time chat)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {demoAccounts.map((acc) => {
            const isCurrent = user?.username === acc.username;
            return (
              <button
                key={acc.username}
                type="button"
                onClick={() => switchUser(acc.username)}
                className="flex items-center gap-2.5 p-2 rounded-xl text-left cursor-pointer transition-all border"
                style={{
                  backgroundColor: isCurrent ? 'var(--surface-2)' : 'var(--surface-1)',
                  borderColor: isCurrent ? 'var(--accent)' : 'var(--line)',
                }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-serif font-medium shrink-0"
                  style={{
                    backgroundColor: `var(--${acc.tint})`,
                    color: 'var(--ink)',
                  }}
                >
                  {acc.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
                    {acc.name}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: isCurrent ? 'var(--accent)' : 'var(--muted)' }}>
                    {isCurrent ? 'Active Now' : '@' + acc.username}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preferences Group */}
      <div
        className="my-3"
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

        {/* Add to Home Screen (PWA Install) */}
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

        {/* Storage and Data */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <HardDrive size={18} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--ink)' }}>Storage and data</div>
              <div className="tnum" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                12.4 MB · IndexedDB offline storage
              </div>
            </div>
          </div>
          <button
            type="button"
            className="text-xs cursor-pointer hover:underline"
            style={{ color: 'var(--muted)' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Security Group */}
      <div
        className="my-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
        onClick={() => navigate('/security/user_maya')}
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--ink)' }}>Security details</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Device keys &amp; verification</div>
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* Logout Row */}
      <div
        className="my-1 cursor-pointer"
        onClick={logout}
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <LogOut size={18} style={{ color: 'var(--heart)' }} />
            <div style={{ fontSize: '15px', color: 'var(--heart)' }}>Log out</div>
          </div>
        </div>
      </div>

      {/* iOS / Install Instructions Modal */}
      {showInstallAlert && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-xs"
          onClick={() => setShowInstallAlert(false)}
        >
          <div
            className="w-full max-w-sm p-6 rounded-2xl select-none"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '20px',
                fontWeight: 500,
                color: 'var(--ink)',
                marginBottom: '8px',
              }}
            >
              {isInstalled ? 'Already Installed' : isIOS ? 'Install on iOS Safari' : 'Install WhatsUS'}
            </h3>
            <p
              style={{
                fontSize: '14px',
                lineHeight: 1.5,
                color: 'var(--muted)',
                marginBottom: '20px',
              }}
            >
              {isInstalled
                ? 'This app is already installed on your device home screen.'
                : isIOS
                ? 'Tap the Share icon in Safari’s navigation bar, scroll down and tap "Add to Home Screen".'
                : 'To install on Android or Chrome desktop, click the Install icon in the browser address bar or menu.'}
            </p>
            <button
              type="button"
              onClick={() => setShowInstallAlert(false)}
              className="w-full py-2.5 rounded-xl font-medium cursor-pointer transition-transform active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontSize: '14px',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
