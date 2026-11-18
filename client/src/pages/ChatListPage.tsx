import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, SquarePen, Pin, Mic, Image, BellOff, Inbox, UserPlus, Search, MessageSquare } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { apiGetContactRequests } from '../lib/api';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { searchLocalMessages, SearchResultItem } from '../lib/searchIndex';

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

  // Search contacts and encrypted in-memory messages
  const matchingMessages = useMemo<SearchResultItem[]>(() => {
    if (!searchQuery.trim()) return [];
    return searchLocalMessages(searchQuery);
  }, [searchQuery]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return formattedChats;
    const q = searchQuery.toLowerCase();
    const messagePartnerIds = new Set(matchingMessages.map((m) => m.partnerId));

    return formattedChats.filter(
      (chat) =>
        chat.name.toLowerCase().includes(q) ||
        (chat.username && chat.username.toLowerCase().includes(q)) ||
        chat.snippet.toLowerCase().includes(q) ||
        messagePartnerIds.has(chat.id)
    );
  }, [formattedChats, searchQuery, matchingMessages]);

  return (
    <div className="flex flex-col min-h-full" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Offline / Reconnecting Banner */}
      <ConnectionBanner status={wsStatus} />

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
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
            }}
          >
            <div className="flex items-center gap-2">
              <Inbox size={15} />
              <span>Pending Message Requests</span>
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              {pendingRequestsCount}
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

      {/* Search Input with honest in-memory device-only privacy label */}
      {formattedChats.length > 0 && (
        <div className="px-5 pb-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
            }}
          >
            <Search size={15} style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full text-xs outline-none bg-transparent"
              style={{
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
          <div className="text-[10px] mt-1 px-1" style={{ color: 'var(--muted)' }}>
            Searches messages on this device only
          </div>
        </div>
      )}

      {/* Chat List or Empty State */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-20">
        {formattedChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-20 px-6 text-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs"
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
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            {filteredChats.map((chat) => {
              const isOnline = isUserOnline(chat.id);
              const matchingMsg = matchingMessages.find((m) => m.partnerId === chat.id);

              return (
                <div
                  key={chat.id}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-black/5 active:bg-black/10 select-none relative"
                >
                  {/* Monogram Avatar with Online Ring */}
                  <div className="relative shrink-0">
                    <div
                      className="flex items-center justify-center select-none"
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: `var(--${chat.tint}, #D9CDB8)`,
                        color: '#1D1B18',
                        fontFamily: 'var(--font-serif)',
                        fontSize: '17px',
                        fontWeight: 600,
                      }}
                    >
                      {chat.initials}
                    </div>

                    {isOnline && (
                      <span
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                        style={{
                          backgroundColor: 'var(--accent)',
                          borderColor: 'var(--bg)',
                        }}
                        title="Online"
                      />
                    )}
                  </div>

                  {/* Contact Info & Message Preview */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="truncate"
                          style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 'var(--text-contact-name)',
                            fontWeight: 500,
                            letterSpacing: '-0.01em',
                            color: 'var(--ink)',
                          }}
                        >
                          {chat.name}
                        </span>
                        {chat.isPinned && (
                          <Pin size={12} className="rotate-45 shrink-0 opacity-60" />
                        )}
                        {chat.isMuted && (
                          <BellOff size={12} className="shrink-0 opacity-40" />
                        )}
                      </div>

                      <span
                        className="shrink-0 text-right tnum"
                        style={{
                          fontSize: 'var(--text-meta)',
                          color: chat.unreadCount > 0 ? 'var(--accent)' : 'var(--muted)',
                          fontWeight: chat.unreadCount > 0 ? 600 : 400,
                        }}
                      >
                        {chat.time}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div
                        className="text-xs truncate flex items-center gap-1"
                        style={{
                          color: matchingMsg ? 'var(--accent)' : chat.unreadCount > 0 ? 'var(--ink)' : 'var(--muted)',
                          fontWeight: chat.unreadCount > 0 || matchingMsg ? 500 : 400,
                        }}
                      >
                        {matchingMsg ? (
                          <>
                            <MessageSquare size={12} className="shrink-0" />
                            <span className="truncate italic">Match: "{matchingMsg.snippet}"</span>
                          </>
                        ) : (
                          <>
                            {chat.hasVoice && <Mic size={13} className="shrink-0 opacity-75" />}
                            {chat.hasPhoto && <Image size={13} className="shrink-0 opacity-75" />}
                            <span className="truncate">{chat.snippet}</span>
                          </>
                        )}
                      </div>

                      {chat.unreadCount > 0 && (
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            minWidth: '18px',
                            height: '18px',
                            padding: '0 5px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: 'var(--accent)',
                            color: 'var(--accent-ink)',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {chat.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatListPage;
