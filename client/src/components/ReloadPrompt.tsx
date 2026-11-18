import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export const ReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        // Periodic check for SW update (every 1 hour)
        setInterval(() => {
          r.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn('[SW Registration Error]', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border animate-slide-up backdrop-blur-md"
      style={{
        backgroundColor: 'var(--surface-1)',
        borderColor: 'var(--line)',
        color: 'var(--ink)',
      }}
    >
      <div className="flex flex-col">
        <span className="text-xs font-semibold">Update available</span>
        <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
          A new version of WhatsUs is ready.
        </span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg cursor-pointer transition-transform active:scale-95"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          <RefreshCw size={12} className="animate-spin-once" />
          <span>Refresh</span>
        </button>
        <button
          type="button"
          aria-label="Dismiss update banner"
          onClick={() => setNeedRefresh(false)}
          className="p-1 rounded-lg hover:bg-black/5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default ReloadPrompt;
