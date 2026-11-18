import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface EmptyStateProps {
  headline?: string;
  title?: string;
  body?: string;
  description?: string;
  action?: EmptyStateAction;
  buttonText?: string;
  actionText?: string;
  actionLabel?: string;
  onClick?: () => void | Promise<void>;
  onAction?: () => void | Promise<void>;
  icon?: LucideIcon | React.ReactNode;
  className?: string;
}

export function EmptyState({
  headline,
  title,
  body,
  description,
  action,
  buttonText,
  actionText,
  actionLabel,
  onClick,
  onAction,
  icon,
  className = '',
}: EmptyStateProps) {
  const resolvedHeadline = headline || title || '';
  const resolvedBody = body || description || '';
  const resolvedActionLabel = action?.label || buttonText || actionText || actionLabel;
  const resolvedActionClick = action?.onClick || onAction || onClick;

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return (
        <div
          className="w-[52px] h-[52px] rounded-full flex items-center justify-center mb-4 shrink-0"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--accent)',
          }}
        >
          {icon}
        </div>
      );
    }
    const IconComp = icon as LucideIcon;
    return (
      <div
        className="w-[52px] h-[52px] rounded-full flex items-center justify-center mb-4 shrink-0"
        style={{
          backgroundColor: 'var(--surface-1)',
          color: 'var(--accent)',
        }}
      >
        <IconComp size={24} strokeWidth={1.75} />
      </div>
    );
  };

  return (
    <div
      className={`w-full flex-1 flex flex-col items-center justify-center text-center p-6 min-h-[260px] select-none ${className}`}
    >
      {/* Optional leading icon */}
      {renderIcon()}

      {/* Headline (Fraunces 22px) */}
      {resolvedHeadline && (
        <h2
          className="tracking-tight max-w-[280px]"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '22px',
            fontWeight: 500,
            lineHeight: 1.25,
            color: 'var(--ink)',
            marginBottom: '8px',
          }}
        >
          {resolvedHeadline}
        </h2>
      )}

      {/* Body (14px Inter var(--muted)) */}
      {resolvedBody && (
        <p
          className="max-w-[260px]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            lineHeight: 1.45,
            color: 'var(--muted)',
            marginBottom: resolvedActionLabel ? '20px' : '0px',
          }}
        >
          {resolvedBody}
        </p>
      )}

      {/* Action button (btn-accent: var(--accent) bg, var(--accent-ink) text, 12px radius) */}
      {resolvedActionLabel && (
        <button
          type="button"
          onClick={resolvedActionClick}
          className="min-h-[44px] px-6 py-2.5 font-medium cursor-pointer transition-transform active:scale-[0.98] border-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderRadius: '12px',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            lineHeight: 1.2,
          }}
        >
          {resolvedActionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
