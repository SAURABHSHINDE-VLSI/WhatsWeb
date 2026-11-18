import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, SquarePen, Pin, Mic, Image, BellOff, WifiOff, Inbox, UserPlus } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { apiGetContactRequests } from '../lib/api';

export function ChatListPage() {
  const navigate = useNavigate();
  const { chats: liveChats, isUserOnline, wsStatus } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Check for incoming pending message requests
  useEffect(() => {
    apiGetContactRequests()
      .then((res) => {
        setPendingRequestsCount(res.requests.length);
      })
      .catch(() => {});
  }, []);

  const formattedChats = useMemo(() => {
    return liveChats.map((live) => {
      const tintKey = (`tint-${(live.tint % 4) + 1}`) as 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
      const initials = (live.name || live.username || '?')
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return {
        id: live.id,
        name: live.name || live.username || 'Contact',
        username: live.username,
        initials,
        tint: tintKey,
        time: live.lastMessageTime || '',
        snippet: live.snippet || 'No messages yet',
        unreadCount: live.unreadCount,
        isPinned: live.isPinned,
        isMuted: live.isMuted,
        hasVoice: live.hasVoice,
        hasPhoto: live.hasPhoto,
      };
    });
  }, [liveChats]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return formattedChats;
    const q = searchQuery.toLowerCase();
    return formattedChats.filter(
      (chat) =>
        chat.name.toLowerCase().includes(q) ||
        (chat.username && chat.username.toLowerCase().includes(q)) ||
        chat.snippet.toLowerCase().includes(q)
    );
  }, [formattedChats, searchQuery]);

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
          onClick={() => navigate('/new-chat')}
          className="cursor-pointer transition-opacity hover:opacity-80 p-1 -mr-1"
          style={{ color: 'var(--ink)' }}
          title="New Connection"
        >
          <SquarePen size={20} strokeWidth={1.75} />
        </button>
      </header>

      {/* Message Requests Banner if any */}
      {pendingRequestsCount > 0 && (
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => navigate('/requests')}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-sm"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
            }}
          >
            <div className="flex items-center gap-2">
              <Inbox size={15} />
              <span>{pendingRequestsCount} Pending Message {pendingRequestsCount === 1 ? 'Request' : 'Requests'}</span>
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Review
            </span>
          </button>
        </div>
      )}

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
      {formattedChats.length > 0 && (
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
      )}

      {/* Chat List or Empty State */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
        {formattedChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-20 px-6 text-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm"
              style={{
                backgroundColor: 'var(--surface-1)',
                color: 'var(--accent)',
              }}
            >
              <UserPlus size={30} />
            </div>

            <div className="max-w-xs">
              <h3
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                No Conversations Yet
              </h3>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                Connect with contacts by searching their exact @username or sharing your personal invite link.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/new-chat')}
              className="flex items-center gap-2 py-2.5 px-5 rounded-xl text-xs font-semibold cursor-pointer transition-opacity"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              <SquarePen size={15} />
              <span>Start Correspondence</span>
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => {
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
          })
        )}
      </div>
    </div>
  );
}

export default ChatListPage;
