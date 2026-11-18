import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, Settings as SettingsIcon } from 'lucide-react';

export interface TabItem {
  id: string;
  label: string;
  path: string;
  icon: typeof MessageSquare;
}

export interface BottomNavProps {
  active?: string;
  activeTab?: string;
  onTabChange?: (path: string) => void;
  className?: string;
}

const TABS: TabItem[] = [
  { id: 'chats', label: 'Chats', path: '/', icon: MessageSquare },
  { id: 'calls', label: 'Calls', path: '/calls', icon: Phone },
  { id: 'settings', label: 'Settings', path: '/settings', icon: SettingsIcon },
];

export function BottomNav({
  active,
  activeTab,
  onTabChange,
  className = '',
}: BottomNavProps) {
  const effectiveActive = active || activeTab;
  const location = useLocation();
  const navigate = useNavigate();

  const handleTabClick = (path: string) => {
    if (onTabChange) {
      onTabChange(path);
    } else {
      navigate(path);
    }
  };

  const isTabActive = (tab: TabItem) => {
    if (effectiveActive) {
      return effectiveActive === tab.id || effectiveActive === tab.path;
    }
    if (tab.path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(tab.path);
  };

  return (
    <nav
      aria-label="Main Navigation"
      className={`w-full shrink-0 flex items-center justify-around z-40 select-none ${className}`}
      style={{
        height: '64px',
        backgroundColor: 'var(--bg)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map((tab) => {
        const active = isTabActive(tab);
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.path)}
            className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] min-w-[44px] cursor-pointer transition-colors border-none bg-transparent outline-none focus-visible:opacity-80"
            style={{
              color: active ? 'var(--accent)' : 'var(--muted)',
            }}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
          >
            <Icon
              size={20}
              strokeWidth={1.75}
              style={{
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: active ? 600 : 500,
                letterSpacing: '0.01em',
                marginTop: '4px',
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
