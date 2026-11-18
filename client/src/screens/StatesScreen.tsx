import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, BottomNav } from '../components';

type StateTab = 'empty' | 'loading' | 'error';

export function StatesScreen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StateTab>('empty');
  const [, setRetryCount] = useState(0);

  const tabs: { label: string; value: StateTab }[] = [
    { label: 'Empty', value: 'empty' },
    { label: 'Loading', value: 'loading' },
    { label: 'Error', value: 'error' },
  ];

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <style>{`
        @keyframes shimmerPulse {
          0% {
            background-color: var(--surface-1);
            opacity: 0.6;
          }
          50% {
            background-color: var(--surface-2);
            opacity: 1;
          }
          100% {
            background-color: var(--surface-1);
            opacity: 0.6;
          }
        }
        .skeleton-shimmer {
          animation: shimmerPulse 1.8s ease-in-out infinite;
        }
      `}</style>

      {/* Main Content Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col">
        {/* Top Header */}
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
            States
          </h1>
        </header>

        {/* Tab Switcher: Empty | Loading | Error */}
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
            role="tablist"
            aria-label="Component state preview tabs"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.value)}
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
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* State Views Container */}
        <main
          className="flex-1 flex flex-col"
          style={{
            paddingBottom: '80px', // Clearance for BottomNav
          }}
        >
          {/* 1. Empty State View */}
          {activeTab === 'empty' && (
            <div className="flex-1 flex flex-col justify-center items-center px-6">
              <EmptyState
                headline="No chats yet. Say hello to someone."
                title="No chats yet. Say hello to someone."
                body="Your inbox is clear and quiet..."
                description="Your inbox is clear and quiet..."
                buttonText="Start a chat"
                actionText="Start a chat"
                actionLabel="Start a chat"
                onAction={() => navigate('/')}
                onClick={() => navigate('/')}
              />
            </div>
          )}

          {/* 2. Loading State View: 3 Skeleton Chat Rows */}
          {activeTab === 'loading' && (
            <div
              className="flex flex-col w-full"
              role="status"
              aria-label="Loading chats..."
            >
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex items-center gap-3.5 w-full"
                  style={{
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                    minHeight: '68px',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  {/* 46px Circle Skeleton */}
                  <div
                    className="skeleton-shimmer shrink-0"
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--surface-1)',
                    }}
                  />

                  {/* 2 Bars Skeleton */}
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between">
                      {/* Name Bar */}
                      <div
                        className="skeleton-shimmer"
                        style={{
                          width: row === 1 ? '128px' : row === 2 ? '104px' : '140px',
                          height: '14px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--surface-1)',
                        }}
                      />
                      {/* Time Bar */}
                      <div
                        className="skeleton-shimmer shrink-0"
                        style={{
                          width: '44px',
                          height: '11px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--surface-1)',
                        }}
                      />
                    </div>

                    {/* Snippet Bar */}
                    <div
                      className="skeleton-shimmer"
                      style={{
                        width: row === 1 ? '85%' : row === 2 ? '65%' : '75%',
                        height: '13px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--surface-1)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 3. Error / Offline State View */}
          {activeTab === 'error' && (
            <div className="flex-1 flex flex-col justify-center items-center px-6">
              <EmptyState
                headline="You're offline. We'll send your messages when you're back."
                title="You're offline. We'll send your messages when you're back."
                body="Check your internet connection to sync your latest messages."
                description="Check your internet connection to sync your latest messages."
                buttonText="Retry now"
                actionText="Retry now"
                actionLabel="Retry now"
                onAction={handleRetry}
                onClick={handleRetry}
              />
            </div>
          )}
        </main>
      </div>

      {/* Fixed Bottom Navigation Bar with Chats Active */}
      <BottomNav active="chats" activeTab="chats" />
    </div>
  );
}

export default StatesScreen;
