import { BrowserRouter, Routes, Route, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { MessageSquare, Phone, Settings as SettingsIcon } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { CallProvider } from './contexts/CallContext';
import { CallModal } from './components/CallModal';
import ChatListPage from './pages/ChatListPage';
import ConversationPage from './pages/ConversationPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import CallsPage from './pages/CallsPage';
import StatesScreen from './screens/StatesScreen';
import SecurityDetailsScreen from './screens/SecurityDetailsScreen';

interface NavTabItem {
  label: string;
  path: string;
  icon: typeof MessageSquare;
}

const NAV_TABS: NavTabItem[] = [
  { label: 'Chats', path: '/', icon: MessageSquare },
  { label: 'Calls', path: '/calls', icon: Phone },
  { label: 'Settings', path: '/settings', icon: SettingsIcon },
];

/**
 * Main application layout featuring the 3-tab bottom navigation
 * (Chats, Calls, Settings) using Lucide icons.
 */
export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Scrollable View Area */}
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <Outlet />
      </main>

      {/* 3-Tab Bottom Navigation Bar */}
      <nav
        aria-label="Main Navigation"
        className="w-full shrink-0 flex items-center justify-around pb-safe pt-1.5 z-40"
        style={{
          borderTop: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
          backdropFilter: 'blur(16px)',
          minHeight: '64px',
        }}
      >
        {NAV_TABS.map((tab) => {
          const isActive =
            tab.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(tab.path);
          const Icon = tab.icon;

          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 cursor-pointer transition-colors"
              style={{
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.01em',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Root App component configured with ThemeProvider and React Router routes:
 * - / (ChatList)
 * - /chat/:id (Conversation)
 * - /profile/:id (Profile)
 * - /settings (Settings)
 * - /onboarding (Onboarding)
 */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          <ChatProvider>
            <BrowserRouter>
              <CallModal />
              <Routes>
                {/* Main Tabbed Screens wrapped with 3-tab Layout */}
                <Route element={<Layout />}>
                  <Route path="/" element={<ChatListPage />} />
                  <Route path="/calls" element={<CallsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>

                {/* Full Screen Screens (without bottom tab bar) */}
                <Route path="/chat/:id" element={<ConversationPage />} />
                <Route path="/profile/:id" element={<ProfilePage />} />
                <Route path="/security/:id" element={<SecurityDetailsScreen />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/states" element={<StatesScreen />} />

                {/* Fallback route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ChatProvider>
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
