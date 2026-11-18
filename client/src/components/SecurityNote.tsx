import React from 'react';
import { Lock } from 'lucide-react';

export interface SecurityNoteProps {
  text?: string;
  className?: string;
}

export function SecurityNote({
  text = 'End-to-end encrypted',
  className = '',
}: SecurityNoteProps) {
  return (
    <div
      role="note"
      aria-label={text}
      className={`flex items-center gap-[6px] select-none ${className}`}
      style={{
        paddingLeft: '22px',
        paddingRight: '22px',
        marginBottom: '14px',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        color: 'var(--muted)',
      }}
    >
      <Lock
        size={12}
        strokeWidth={1.75}
        className="shrink-0"
        style={{ color: 'var(--accent)' }}
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
}

export default SecurityNote;
