import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Mic, ArrowUp } from 'lucide-react';

export interface ComposerProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onVoiceRecord?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Composer({
  onSend,
  onAttach,
  onVoiceRecord,
  placeholder = 'Message...',
  disabled = false,
  className = '',
}: ComposerProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasText = text.trim().length > 0;

  const handleSend = () => {
    if (!hasText || disabled) return;
    onSend(text.trim());
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleActionClick = () => {
    if (hasText) {
      handleSend();
    } else {
      onVoiceRecord?.();
    }
  };

  return (
    <footer
      className={`w-full flex items-center gap-[10px] px-[18px] pt-[10px] pb-[16px] z-30 ${className}`}
      style={{
        backgroundColor: 'var(--header-bg, var(--bg))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
      }}
    >
      {/* Plus Attachment Button (Touch target >= 44px) */}
      <button
        type="button"
        onClick={onAttach}
        disabled={disabled}
        className="w-[44px] h-[44px] flex items-center justify-center shrink-0 cursor-pointer rounded-full transition-opacity active:opacity-70 disabled:opacity-40"
        aria-label="Add attachment"
      >
        <Plus
          size={20}
          strokeWidth={1.75}
          style={{ color: 'var(--muted)' }}
        />
      </button>

      {/* Surface-1 Pill Input */}
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full outline-none border-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--ink)',
            borderRadius: '20px',
            padding: '10px 16px',
            fontFamily: 'var(--font-sans)',
            fontSize: '16px',
            minHeight: '40px',
          }}
        />
      </div>

      {/* Round Action Button (40px circle with >= 44px touch container) */}
      <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0">
        <motion.button
          type="button"
          onClick={handleActionClick}
          disabled={disabled}
          animate={{
            backgroundColor: hasText ? 'var(--accent)' : 'var(--surface-1)',
            color: hasText ? 'var(--accent-ink)' : 'var(--ink)',
            scale: 1,
          }}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="w-[40px] h-[40px] rounded-full flex items-center justify-center cursor-pointer border-none shrink-0 overflow-hidden shadow-sm disabled:opacity-40"
          aria-label={hasText ? 'Send message' : 'Record voice note'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {hasText ? (
              <motion.div
                key="arrow-up"
                initial={{ rotate: -45, opacity: 0, scale: 0.7 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 45, opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="flex items-center justify-center"
              >
                <ArrowUp size={18} strokeWidth={1.75} />
              </motion.div>
            ) : (
              <motion.div
                key="mic"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="flex items-center justify-center"
              >
                <Mic size={18} strokeWidth={1.75} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </footer>
  );
}

export default Composer;
