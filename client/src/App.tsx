import React from 'react';
import { BrowserRouter, Routes, Route, Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { MessageSquare, Phone, Settings as SettingsIcon, Feather } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLockProvider } from './contexts/AppLockContext';
import { ChatProvider } from './contexts/ChatContext';
import { CallProvider } from './contexts/CallContext';
import { CallModal } from './components/CallModal';
import { PageSkeleton } from './components/PageSkeleton';
import { ReloadPrompt } from './components/ReloadPrompt';

// Lazy-loaded page routes for minimal initial JS bundle (< 200KB gzipped)
const ChatListPage = React.lazy(() => import('./pages/ChatListPage'));
const ConversationPage = React.lazy(() => import('./pages/ConversationPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const OnboardingPage = React.lazy(() => import('./pages/OnboardingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const ConnectPage = React.lazy(() => import('./pages/ConnectPage'));
const RequestsPage = React.lazy(() => import('./pages/RequestsPage'));
const InvitePage = React.lazy(() => import('./pages/InvitePage'));
const CallsPage = React.lazy(() => import('./pages/CallsPage'));
const SecurityDetailsPage = React.lazy(() => import('./pages/SecurityDetailsPage'));
const ShareTargetPage = React.lazy(() => import('./pages/ShareTargetPage'));

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
        <React.Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </React.Suspense>
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

function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center h-dvh w-full select-none"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm animate-pulse"
          style={{ backgroundColor: 'var(--surface-1)', color: 'var(--accent)' }}
        >
          <Feather size={32} />
        </div>
        <p className="text-xs font-serif" style={{ color: 'var(--muted)' }}>
          WhatsUS • Decrypting session...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppLockProvider>
          <CallProvider>
            <ChatProvider>
              <BrowserRouter>
                <CallModal />
                <ReloadPrompt />
                <React.Suspense fallback={<PageSkeleton />}>
                  <Routes>
                    {/* Public Auth Routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/invite/:code" element={<InvitePage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />

                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute />}>
                      {/* Tabbed Layout */}
                      <Route element={<Layout />}>
                        <Route path="/" element={<ChatListPage />} />
                        <Route path="/calls" element={<CallsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                      </Route>

                      {/* Full Screen Screens */}
                      <Route path="/new-chat" element={<ConnectPage />} />
                      <Route path="/requests" element={<RequestsPage />} />
                      <Route path="/chat/:id" element={<ConversationPage />} />
                      <Route path="/profile/:id" element={<ProfilePage />} />
                      <Route path="/security/:id" element={<SecurityDetailsPage />} />
                      <Route path="/share" element={<ShareTargetPage />} />
                    </Route>

                    {/* Fallback route */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </React.Suspense>
              </BrowserRouter>
            </ChatProvider>
          </CallProvider>
        </AppLockProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
