import React from 'react';
import { WifiOff, Loader2 } from 'lucide-react';
import { WSConnectionStatus } from '../lib/wsClient';

interface ConnectionBannerProps {
  status: WSConnectionStatus;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ status }) => {
  if (status === 'connected') return null;

  const isReconnecting = status === 'reconnecting' || status === 'connecting';

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full px-3 py-1.5 flex items-center justify-center gap-2 text-xs font-medium z-40 transition-all duration-300"
      style={{
        backgroundColor: isReconnecting ? 'var(--surface-2)' : 'rgba(180, 69, 47, 0.15)',
        color: isReconnecting ? 'var(--ink)' : 'var(--heart)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {isReconnecting ? (
        <>
          <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
          <span>Reconnecting...</span>
        </>
      ) : (
        <>
          <WifiOff size={13} />
          <span>Offline — messages will send automatically when you're back</span>
        </>
      )}
    </div>
  );
};

export default ConnectionBanner;
