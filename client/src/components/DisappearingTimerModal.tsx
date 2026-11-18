import React from 'react';
import { X, Clock, Check, AlertTriangle } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

interface DisappearingTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  partnerId: string;
}

const TIMER_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '1 Hour', seconds: 3600 },
  { label: '24 Hours (1 Day)', seconds: 86400 },
  { label: '7 Days (1 Week)', seconds: 604800 },
];

export function DisappearingTimerModal({
  isOpen,
  onClose,
  partnerId,
}: DisappearingTimerModalProps) {
  const { setDisappearingTimer } = useChat();

  if (!isOpen) return null;

  const currentSeconds =
    Number(localStorage.getItem(`whatsus_disappearing_${partnerId}`)) || 0;

  const handleSelect = async (seconds: number) => {
    await setDisappearingTimer(partnerId, seconds);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Disappearing Messages Timer"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl flex flex-col gap-4 animate-in zoom-in-95"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--line)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={18} style={{ color: 'var(--accent)' }} />
            <h3 className="text-base font-semibold font-serif">Disappearing Messages</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          Messages sent in this chat will be deleted from both devices and server queues after the timer expires.
        </p>

        <div className="flex flex-col gap-2 my-2">
          {TIMER_OPTIONS.map((opt) => {
            const isSelected = currentSeconds === opt.seconds;
            return (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => handleSelect(opt.seconds)}
                className="flex items-center justify-between p-3 rounded-2xl border text-left cursor-pointer transition-all hover:bg-black/5"
                style={{
                  backgroundColor: isSelected ? 'var(--surface-2)' : 'var(--bg)',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--line)',
                }}
              >
                <span className="text-xs font-medium">{opt.label}</span>
                {isSelected && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </button>
            );
          })}
        </div>

        <div
          className="p-3 rounded-2xl border flex items-start gap-2 text-[11px]"
          style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg)', color: 'var(--muted)' }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            Best-effort security: A modified recipient client or external camera can still record messages before expiry.
          </span>
        </div>
      </div>
    </div>
  );
}
