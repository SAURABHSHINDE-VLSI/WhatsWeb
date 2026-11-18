import React from 'react';
import { ExternalLink, ShieldAlert, X } from 'lucide-react';

interface LinkInterstitialModalProps {
  url: string | null;
  onClose: () => void;
}

export const LinkInterstitialModal: React.FC<LinkInterstitialModalProps> = ({ url, onClose }) => {
  if (!url) return null;

  let hostname = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
  } catch {
    hostname = 'unknown site';
  }

  const handleProceed = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interstitial-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95 duration-150"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--line)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--accent)] font-serif font-semibold">
            <ShieldAlert size={20} />
            <h2 id="interstitial-title" className="text-sm font-medium">External Link</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            You are about to leave WhatsUs to visit an external website:
          </p>
          <div
            className="p-2.5 rounded-xl border text-xs break-all font-mono select-text"
            style={{
              backgroundColor: 'var(--surface-2)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
          >
            <span className="font-bold text-[var(--accent)]">{hostname}</span>
            <div className="text-[11px] opacity-75 mt-1">{url}</div>
          </div>
          <p className="text-[11px] leading-normal" style={{ color: 'var(--muted)' }}>
            External websites can see your IP address and may use cookies or tracking. Only continue if you trust this destination.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-black/5 transition-colors"
            style={{ color: 'var(--muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-transform active:scale-95"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            <span>Continue</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkInterstitialModal;
