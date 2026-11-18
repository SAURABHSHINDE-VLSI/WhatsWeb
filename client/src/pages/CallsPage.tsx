import { Phone, Video, PhoneCall, SquarePen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCall } from '../contexts/CallContext';
import { useChat } from '../contexts/ChatContext';

export function CallsPage() {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { chats, isUserOnline } = useChat();

  return (
    <div className="flex flex-col min-h-full" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Header */}
      <header className="px-5 pt-4 pb-2 flex items-baseline justify-between pt-safe">
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-title)',
              letterSpacing: '-0.02em',
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.15,
            }}
          >
            Calls
          </h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            E2EE Voice &amp; Video via WebRTC
          </p>
        </div>

        <button
          type="button"
          aria-label="New call"
          onClick={() => navigate('/new-chat')}
          className="cursor-pointer transition-opacity hover:opacity-80 p-1"
          style={{ color: 'var(--ink)' }}
          title="Start call with contact"
        >
          <PhoneCall size={20} strokeWidth={1.75} />
        </button>
      </header>

      {/* Calls List or Clean Empty State */}
      <div className="flex-1 divide-y" style={{ borderColor: 'var(--line)' }}>
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-20 px-6 text-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--surface-1)',
                color: 'var(--accent)',
              }}
            >
              <Phone size={30} />
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
                No Recent Calls
              </h3>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                Start a private, encrypted voice or video call with any contact using peer-to-peer WebRTC.
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
              <span>Find Contact</span>
            </button>
          </div>
        ) : (
          chats.map((chat) => {
            const isOnline = isUserOnline(chat.id);
            const initials = (chat.name || chat.username || '?')
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={chat.id}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-black/5"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center text-xs font-semibold select-none"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: `var(--tint-${((chat.tint || 0) % 4) + 1}, #D9CDB8)`,
                      color: '#1D1B18',
                      fontFamily: 'var(--font-serif)',
                    }}
                  >
                    {initials}
                  </div>

                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '15px',
                        fontWeight: 500,
                        color: 'var(--ink)',
                      }}
                    >
                      {chat.name || chat.username}
                    </div>
                    <div className="text-[11px]" style={{ color: isOnline ? 'var(--accent)' : 'var(--muted)' }}>
                      {isOnline ? 'Online now' : 'Signal E2EE'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Voice call ${chat.name}`}
                    onClick={() => startCall(chat.id, chat.name || chat.username, chat.tint || 0, 'voice')}
                    className="p-2.5 rounded-full hover:bg-black/5 cursor-pointer transition-transform active:scale-95"
                    style={{ color: 'var(--accent)' }}
                    title="Voice Call"
                  >
                    <Phone size={18} />
                  </button>

                  <button
                    type="button"
                    aria-label={`Video call ${chat.name}`}
                    onClick={() => startCall(chat.id, chat.name || chat.username, chat.tint || 0, 'video')}
                    className="p-2.5 rounded-full hover:bg-black/5 cursor-pointer transition-transform active:scale-95"
                    style={{ color: 'var(--accent)' }}
                    title="Video Call"
                  >
                    <Video size={18} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CallsPage;
