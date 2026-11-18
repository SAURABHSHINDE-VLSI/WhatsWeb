import React, { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

export const StorageEvictionBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    // Check if user dismissed previously
    if (localStorage.getItem('whatsus_storage_dismissed') === 'true') {
      return;
    }

    const checkPersistence = async () => {
      let isPersisted = false;
      if (navigator.storage && navigator.storage.persist) {
        try {
          isPersisted = await navigator.storage.persist();
        } catch (_) {
          isPersisted = false;
        }
      }

      // Check iOS Safari environment
      const ua = window.navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone =
        ('standalone' in window.navigator && (window.navigator as any).standalone) ||
        window.matchMedia('(display-mode: standalone)').matches;

      // On iOS non-standalone or when storage persistence could not be acquired, alert the user
      if ((isIOS && !isStandalone) || !isPersisted) {
        setShowBanner(true);
      }
    };

    checkPersistence();
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('whatsus_storage_dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
      role="status"
      aria-label="Storage persistence warning"
      className="mx-4 my-2 p-3 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in"
      style={{
        backgroundColor: 'var(--surface-2)',
        borderColor: 'var(--line)',
        color: 'var(--ink)',
      }}
    >
      <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
      <div className="flex-1 space-y-1">
        <div className="font-semibold text-[var(--ink)]">Storage Persistence Notice</div>
        <p className="leading-relaxed opacity-85">
          Browser storage is temporary. To prevent iOS Safari from clearing your end-to-end encryption keys and chats
          after 7 days of inactivity, tap <strong>Share</strong> and select <strong>'Add to Home Screen'</strong>.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss storage persistence warning"
        className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity cursor-pointer focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
