import React from 'react';

export interface DayDividerProps {
  label?: string;
  text?: string;
  date?: string | Date;
  className?: string;
}

function formatDayLabel(dateInput?: string | Date): string {
  if (!dateInput) return 'TODAY';

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    // If not a parseable date, return string directly
    return String(dateInput).toUpperCase();
  }

  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  if (isToday) return 'TODAY';

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'YESTERDAY';

  // Format as e.g. "OCTOBER 28" or "OCT 28, 2026"
  const sameYear = d.getFullYear() === today.getFullYear();
  return d
    .toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    .toUpperCase();
}

export function DayDivider({
  label,
  text,
  date,
  className = '',
}: DayDividerProps) {
  const effective = label || text;
  const displayLabel = effective ? effective.toUpperCase() : formatDayLabel(date);

  return (
    <div
      role="separator"
      aria-label={displayLabel}
      className={`self-center text-center select-none ${className}`}
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        marginTop: '4px',
        marginBottom: '6px',
      }}
    >
      {displayLabel}
    </div>
  );
}

export default DayDivider;
