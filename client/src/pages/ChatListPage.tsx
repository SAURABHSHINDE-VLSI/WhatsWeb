import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, SquarePen, Pin, Mic, Image, BellOff, WifiOff } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

interface FallbackChat {
  id: string;
  name: string;
  initials: string;
  tint: 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
  time: string;
  snippet: string;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  hasVoice?: boolean;
  hasPhoto?: boolean;
}

const FALLBACK_CHATS: FallbackChat[] = [
  {
    id: 'user_maya',
    name: 'Maya Lin',
    initials: 'ML',
    tint: 'tint-1',
    time: '10:42 AM',
    snippet: 'The book arrived this morning! Reading chapter 3 tonight.',
    unreadCount: 1,
    isPinned: true,
  },
  {
    id: 'user_julian',
    name: 'Julian Vance',
    initials: 'JV',
    tint: 'tint-2',
    time: '9:18 AM',
    snippet: 'Voice message (0:42)',
    unreadCount: 0,
    hasVoice: true,
  },
  {
    id: 'user_amara',
    name: 'Amara Rao',
    initials: 'AR',
    tint: 'tint-4',
    time: 'Yesterday',
    snippet: 'Courtyard layout photo',
    hasPhoto: true,
  },
  {
    id: 'c_dinner',
    name: 'Sunday Dinner',
    initials: 'SD',
    tint: 'tint-3',
    time: 'Yesterday',
    snippet: 'Claire: Can everyone bring a side dish or dessert?',
  },
  {
    id: 'c_building',
    name: 'Building Notice Board',
    initials: 'BH',
    tint: 'tint-1',
    time: 'Mon',
    snippet: 'Elevator inspection scheduled for Thursday 9 AM.',
    isMuted: true,
  },
  {
    id: 'c_doctor',
    name: 'Dr. Elizabeth Montgomery-Smith',
    initials: 'EK',
    tint: 'tint-2',
    time: 'Oct 28',
    snippet: 'Thank you for confirming the lab appointment.',
  },
  {
    id: 'c_theo',
    name: 'Theo Harris',
    initials: 'TH',
    tint: 'tint-3',
    time: 'Oct 24',
    snippet: 'Let me know when you land in Zurich.',
  },
  {
    id: 'c_sophie',
    name: 'Sophie Laurent',
    initials: 'SL',
    tint: 'tint-4',
    time: 'Oct 19',
    snippet: 'Shared an article: Architecture of Quiet',
  },
];

export function ChatListPage() {
  const navigate = useNavigate();
  const { chats: liveChats, isUserOnline, wsStatus } = useChat();
  const [searchQuery, setSearchQuery] = useState('');

  // Merge live server chats with initial directory
  const mergedChats = useMemo(() => {
    const list: FallbackChat[] = [...FALLBACK_CHATS];

    for (const live of liveChats) {
      const idx = list.findIndex((c) => c.id === live.id || c.name.toLowerCase() === live.name.toLowerCase());
      const tintKey = (`tint-${(live.tint % 4) + 1}`) as 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
      const initials = live.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const item: FallbackChat = {
        id: live.id,
        name: live.name,
        initials,
        tint: tintKey,
        time: live.lastMessageTime || 'Just now',
        snippet: live.snippet,
        unreadCount: live.unreadCount,
        isPinned: live.isPinned,
        isMuted: live.isMuted,
      };

      if (idx >= 0) {
        list[idx] = { ...list[idx], ...item };
      } else {
        list.unshift(item);
      }
    }

    return list;
  }, [liveChats]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return mergedChats;
    const q = searchQuery.toLowerCase();
    return mergedChats.filter(
      (chat) => chat.name.toLowerCase().includes(q) || chat.snippet.toLowerCase().includes(q)
    );
  }, [mergedChats, searchQuery]);

  return (
    <div className="flex flex-col min-h-full" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Offline / Reconnecting Banner */}
      {wsStatus === 'reconnecting' && (
        <div
          className="flex items-center justify-center gap-2 py-1 px-3 text-xs select-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--muted)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <WifiOff size={13} />
          <span>Reconnecting to network...</span>
        </div>
      )}

      {/* Top Header */}
      <header className="px-5 pt-4 pb-2 flex items-baseline justify-between pt-safe">
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-title)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              fontWeight: 500,
              color: 'var(--ink)',
            }}
          >
            Chats
          </h1>
        </div>

        <button
          type="button"
          aria-label="New chat"
          onClick={() => navigate('/chat/user_maya')}
          className="cursor-pointer transition-opacity hover:opacity-80 p-1 -mr-1"
          style={{ color: 'var(--ink)' }}
        >
          <SquarePen size={20} strokeWidth={1.75} />
        </button>
      </header>

      {/* Subtle Encryption Pill */}
      <div className="px-5 pb-3">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs select-none"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--muted)',
            borderRadius: 'var(--radius-full)',
          }}
        >
          <Lock size={12} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
          <span>Messages are end-to-end encrypted</span>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-5 pb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full px-3.5 py-2 text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--ink)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            fontFamily: 'var(--font-sans)',
          }}
        />
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
        {filteredChats.map((chat) => {
          const isUnread = Boolean(chat.unreadCount && chat.unreadCount > 0);
          const isOnline = isUserOnline(chat.id);

          return (
            <div
              key={chat.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/chat/${chat.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/chat/${chat.id}`);
              }}
              className="flex items-center gap-3.5 px-5 py-3 transition-colors cursor-pointer select-none"
              style={{
                borderBottom: '1px solid var(--line)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {/* Avatar with warm tint and optional online dot */}
              <div className="relative shrink-0">
                <div
                  className="flex items-center justify-center select-none"
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: `var(--${chat.tint})`,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-serif)',
                    fontSize: '16px',
                    fontWeight: 500,
                  }}
                >
                  {chat.initials}
                </div>
                {isOnline && (
                  <span
                    title="Online"
                    className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                    style={{
                      backgroundColor: 'var(--accent)',
                      borderColor: 'var(--bg)',
                    }}
                  />
                )}
              </div>

              {/* Chat details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span
                    className="truncate flex items-center gap-1.5"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 'var(--text-chat-name)',
                      letterSpacing: '-0.01em',
                      fontWeight: isUnread ? 600 : 500,
                      color: 'var(--ink)',
                    }}
                  >
                    {chat.name}
                    {chat.isPinned && <Pin size={12} style={{ color: 'var(--muted)' }} />}
                    {chat.isMuted && <BellOff size={12} style={{ color: 'var(--muted)' }} />}
                  </span>

                  <span
                    className="tnum shrink-0 ml-2"
                    style={{
                      fontSize: 'var(--text-meta)',
                      color: isUnread ? 'var(--accent)' : 'var(--muted)',
                      fontWeight: isUnread ? 500 : 400,
                    }}
                  >
                    {chat.time}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p
                    className="truncate flex items-center gap-1 text-sm"
                    style={{
                      color: isUnread ? 'var(--ink)' : 'var(--muted)',
                      fontWeight: isUnread ? 500 : 400,
                    }}
                  >
                    {chat.hasVoice && <Mic size={13} style={{ color: 'var(--accent)' }} />}
                    {chat.hasPhoto && <Image size={13} style={{ color: 'var(--muted)' }} />}
                    <span className="truncate">{chat.snippet}</span>
                  </p>

                  {isUnread && (
                    <span
                      className="shrink-0 flex items-center justify-center font-medium text-xs tnum"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-ink)',
                        borderRadius: 'var(--radius-full)',
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 5px',
                        fontSize: '11px',
                      }}
                    >
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChatListPage;
