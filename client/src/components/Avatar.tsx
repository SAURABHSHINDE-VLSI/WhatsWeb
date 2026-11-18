import React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  size?: 'sm' | 'md' | 'lg' | number;
  initials?: string;
  tint?: number;
  tintIndex?: number;
  className?: string;
}

const TINTS = [
  'var(--tint-1)',
  'var(--tint-2)',
  'var(--tint-3)',
  'var(--tint-4)',
] as const;

function getInitials(name?: string): string {
  if (!name) return '';
  const clean = name.trim();
  if (!clean) return '';

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getFallbackTintIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % 4;
  }
  return hash;
}

export function Avatar({
  name = '',
  size = 'md',
  initials: explicitInitials,
  tint,
  tintIndex,
  className = '',
  style,
  ...rest
}: AvatarProps) {
  const effectiveTint = tintIndex !== undefined ? tintIndex : tint;
  const resolvedTintIndex =
    typeof effectiveTint === 'number'
      ? ((Math.floor(effectiveTint) % 4) + 4) % 4
      : getFallbackTintIndex(name);

  const backgroundTint = TINTS[resolvedTintIndex];
  const displayInitials = explicitInitials || getInitials(name);

  // Size handling: support predefined string or numeric px
  let sizeClass = '';
  let inlineSizeStyle: React.CSSProperties = {};
  let fontSize = '16px';

  if (typeof size === 'number') {
    inlineSizeStyle = { width: `${size}px`, height: `${size}px` };
    fontSize = `${Math.round(size * 0.38)}px`;
  } else if (size === 'sm') {
    sizeClass = 'w-[32px] h-[32px]';
    fontSize = '13px';
  } else if (size === 'lg') {
    sizeClass = 'w-[84px] h-[84px]';
    fontSize = '32px';
  } else {
    // 'md' default
    sizeClass = 'w-[46px] h-[46px]';
    fontSize = '17px';
  }

  return (
    <div
      role="img"
      aria-label={name || 'Avatar'}
      className={`rounded-full flex items-center justify-center shrink-0 select-none overflow-hidden ${sizeClass} ${className}`}
      style={{
        backgroundColor: backgroundTint,
        color: 'var(--ink)',
        fontFamily: 'var(--font-serif)',
        fontSize,
        fontWeight: 500,
        ...inlineSizeStyle,
        ...style,
      }}
      {...rest}
    >
      <span className="leading-none tracking-tight">{displayInitials}</span>
    </div>
  );
}

export default Avatar;
