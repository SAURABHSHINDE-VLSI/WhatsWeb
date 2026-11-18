import React from 'react';
import { Pin, BellOff, Mic, Image as ImageIcon } from 'lucide-react';
import { Avatar } from './Avatar';

export interface ChatListItemProps {
  id?: string;
  name: string;
  snippet: string;
  time: string;
  unread?: number;
  unreadCount?: number;
  pinned?: boolean;
  isPinned?: boolean;
  muted?: boolean;
  isMuted?: boolean;
  isGroup?: boolean;
  group?: boolean;
  isVoice?: boolean;
  hasVoice?: boolean;
  voiceNote?: string;
  isPhoto?: boolean;
  hasPhoto?: boolean;
  photo?: string;
  avatarTint?: number | 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
  tint?: number | 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
  avatarInitials?: string;
  initials?: string;
  onClick?: () => void | Promise<void>;
  isActive?: boolean;
  className?: string;
}

export function ChatListItem({
  id: _id,
  name,
  snippet,
  time,
  unread = 0,
  unreadCount,
  pinned = false,
  isPinned,
  muted = false,
  isMuted,
  isGroup: _isGroup,
  group: _group,
  isVoice = false,
  hasVoice,
  voiceNote,
  isPhoto = false,
  hasPhoto,
  photo,
  avatarTint,
  tint,
  avatarInitials,
  initials,
  onClick,
  isActive = false,
  className = '',
}: ChatListItemProps) {
  const effectiveUnread = unreadCount !== undefined ? unreadCount : unread;
  const effectivePinned = isPinned !== undefined ? isPinned : pinned;
  const effectiveMuted = isMuted !== undefined ? isMuted : muted;
  const effectiveVoice = hasVoice !== undefined ? hasVoice : isVoice;
  const effectivePhoto = hasPhoto !== undefined ? hasPhoto : isPhoto;
  const effectiveTint = tint !== undefined ? tint : avatarTint;
  const effectiveInitials = initials || avatarInitials;

  const isUnread = effectiveUnread > 0;

  // Resolve tint index (0-3)
  const resolvedTintIndex: number | undefined = (() => {
    if (typeof effectiveTint === 'number') return effectiveTint;
    if (typeof effectiveTint === 'string' && effectiveTint.startsWith('tint-')) {
      const idx = parseInt(effectiveTint.replace('tint-', ''), 10) - 1;
      return isNaN(idx) ? undefined : idx;
    }
    return undefined;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`w-full flex items-center gap-[14px] px-[22px] py-[12px] cursor-pointer select-none transition-colors border-b min-h-[44px] ${
        isActive ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]'
      } ${className}`}
      style={{
        borderColor: 'var(--line)',
      }}
    >
      {/* Avatar (46px circle, initials, tint background) */}
      <Avatar
        name={name}
        initials={effectiveInitials}
        size="md"
        tintIndex={resolvedTintIndex}
      />

      {/* Content column: 2 lines */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[3px]">
        {/* Top row: Name + Icons + Time */}
        <div className="flex justify-between items-baseline gap-[8px]">
          <span
            className="truncate flex-1"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '17px',
              fontWeight: isUnread ? 600 : 500,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            {name}
          </span>

          <div className="shrink-0 flex items-center gap-[6px]">
            {effectiveMuted && (
              <BellOff
                size={14}
                strokeWidth={1.75}
                style={{ color: 'var(--muted)' }}
                aria-label="Muted"
              />
            )}
            {effectivePinned && (
              <Pin
                size={14}
                strokeWidth={1.75}
                style={{ color: 'var(--muted)' }}
                aria-label="Pinned"
              />
            )}
            <span
              className="tnum"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: isUnread ? 'var(--accent)' : 'var(--muted)',
                fontWeight: isUnread ? 500 : 400,
              }}
            >
              {time}
            </span>
          </div>
        </div>

        {/* Bottom row: Snippet + Unread Badge */}
        <div className="flex justify-between items-center gap-[8px]">
          <span
            className="truncate flex-1 flex items-center gap-[5px]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              lineHeight: 1.4,
              color: isUnread ? 'var(--ink)' : 'var(--muted)',
            }}
          >
            {effectiveVoice && (
              <Mic
                size={14}
                strokeWidth={1.75}
                className="shrink-0"
                style={{ color: 'var(--accent)' }}
                aria-hidden="true"
              />
            )}
            {effectivePhoto && (
              <ImageIcon
                size={14}
                strokeWidth={1.75}
                className="shrink-0"
                style={{ color: 'var(--muted)' }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{snippet}</span>
          </span>

          {isUnread && (
            <span
              className="tnum shrink-0 flex items-center justify-center font-semibold"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
                fontSize: '11px',
                minWidth: '18px',
                height: '18px',
                padding: '0 5px',
                borderRadius: '9px',
              }}
            >
              {effectiveUnread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatListItem;
