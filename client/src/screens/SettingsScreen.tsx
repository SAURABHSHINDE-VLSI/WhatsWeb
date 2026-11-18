import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, Download, HardDrive, Shield, Check } from 'lucide-react';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { Avatar, SettingsRow, BottomNav } from '../components';

export function SettingsScreen() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [storageSize, setStorageSize] = useState('12.4 MB');
  const [isStorageCleared, setIsStorageCleared] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // PWA installation detection and handling
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
    } else if (isStandalone) {
      // Already running as standalone
    } else {
      // Informative instruction for iOS / Safari where event is not dispatched
      alert('To install on your device: Tap the Share button in Safari, then select "Add to Home Screen".');
    }
  };

  const handleClearStorage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStorageSize('0 KB');
    setIsStorageCleared(true);
  };

  const themeOptions: { label: string; value: ThemePreference }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Scrollable Settings Stream */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col">
        {/* Large Fraunces Header */}
        <header
          className="shrink-0"
          style={{
            paddingTop: '16px',
            paddingBottom: '8px',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '32px',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              lineHeight: 1.15,
            }}
          >
            Settings
          </h1>
        </header>

        {/* Theme Segmented Picker: Light | Dark | System */}
        <div
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingTop: '12px',
            paddingBottom: '24px',
          }}
        >
          <div
            className="flex p-1 gap-1"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderRadius: '12px',
            }}
            role="radiogroup"
            aria-label="Theme selection"
          >
            {themeOptions.map((opt) => {
              const isActive = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setTheme(opt.value)}
                  className="flex-1 flex items-center justify-center cursor-pointer transition-all"
                  style={{
                    minHeight: '44px',
                    borderRadius: '8px',
                    backgroundColor: isActive ? 'var(--bg)' : 'transparent',
                    color: isActive ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '13px',
                    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                    border: 'none',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings Groups Separated by Hairlines (No Cards) */}

        {/* Group 1: Profile Row */}
        <section
          style={{
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            marginBottom: '24px',
          }}
        >
          <div
            onClick={() => navigate('/profile/me')}
            className="flex items-center justify-between cursor-pointer transition-colors hover:opacity-85"
            style={{
              paddingTop: '12px',
              paddingBottom: '12px',
              paddingLeft: '24px',
              paddingRight: '24px',
              minHeight: '64px',
            }}
          >
            <div className="flex items-center gap-3">
              <Avatar size={42} initials="AM" tint={0} name="Alex Mercer" />
              <div className="flex flex-col">
                <span
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '16px',
                    fontWeight: 500,
                    color: 'var(--ink)',
                    lineHeight: 1.25,
                  }}
                >
                  Alex Mercer
                </span>
                <span
                  className="tnum"
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    marginTop: '2px',
                  }}
                >
                  +1 (555) 019-2834
                </span>
              </div>
            </div>

            <ChevronRight size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
          </div>
        </section>

        {/* Group 2: Notifications, Add to Home Screen, Storage */}
        <section
          style={{
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            marginBottom: '24px',
          }}
        >
          {/* Notifications Row with Toggle */}
          <SettingsRow
            icon={<Bell size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
            title="Notifications"
            rightElement={
              <button
                type="button"
                role="switch"
                aria-checked={notificationsEnabled}
                aria-label="Toggle notifications"
                onClick={() => setNotificationsEnabled((prev) => !prev)}
                className="relative inline-flex items-center cursor-pointer transition-colors"
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '9999px',
                  backgroundColor: notificationsEnabled ? 'var(--accent)' : 'var(--line)',
                  border: 'none',
                  padding: '2px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0px)',
                    transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
                  }}
                />
              </button>
            }
          />

          {/* Hairline Divider */}
          <div style={{ height: '1px', backgroundColor: 'var(--line)', marginLeft: '24px' }} />

          {/* Add to Home Screen (PWA install logic) */}
          <SettingsRow
            icon={<Download size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
            title="Add to Home Screen"
            subtitle={isStandalone ? 'Installed as standalone app' : 'Install standalone app'}
            chevron={!isStandalone}
            rightElement={
              isStandalone ? (
                <div className="flex items-center gap-1.5" style={{ color: 'var(--accent)', fontSize: '12px' }}>
                  <Check size={16} strokeWidth={2} />
                  <span>Installed</span>
                </div>
              ) : (
                <ChevronRight size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
              )
            }
            onClick={handleInstallClick}
          />

          {/* Hairline Divider */}
          <div style={{ height: '1px', backgroundColor: 'var(--line)', marginLeft: '24px' }} />

          {/* Storage Row */}
          <SettingsRow
            icon={<HardDrive size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
            title="Storage and data"
            subtitle={`${storageSize} on device`}
            rightElement={
              <button
                type="button"
                onClick={handleClearStorage}
                disabled={isStorageCleared}
                className="cursor-pointer transition-opacity hover:opacity-75 disabled:opacity-50 flex items-center justify-center"
                style={{
                  fontSize: '13px',
                  color: isStorageCleared ? 'var(--muted)' : 'var(--accent)',
                  fontWeight: 500,
                  minWidth: '44px',
                  minHeight: '44px',
                  paddingLeft: '12px',
                  paddingRight: '8px',
                  border: 'none',
                  background: 'transparent',
                }}
              >
                {isStorageCleared ? 'Cleared' : 'Clear'}
              </button>
            }
          />
        </section>

        {/* Group 3: Security Details */}
        <section
          style={{
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            marginBottom: '80px', // Clearance for BottomNav
          }}
        >
          <SettingsRow
            icon={<Shield size={18} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />}
            title="Security details"
            subtitle="Device keys & verification"
            chevron={true}
            rightElement={<ChevronRight size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
            onClick={() => {}}
          />
        </section>
      </div>

      {/* Fixed Bottom Navigation Bar with Settings Active */}
      <BottomNav active="settings" activeTab="settings" />
    </div>
  );
}

export default SettingsScreen;
