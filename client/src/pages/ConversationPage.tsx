import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Phone,
  Video,
  Plus,
  Mic,
  Send,
  Check,
  CheckCheck,
  Play,
  Pause,
  Trash2,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useCall } from '../contexts/CallContext';

interface DisplayMessage {
  id: string;
  sender: 'them' | 'me';
  text?: string;
  time: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read';
  quote?: { author: string; text: string };
  isVoice?: boolean;
  voiceDuration?: string;
  photoUrl?: string;
  reaction?: string;
  reactionCount?: number;
}

const DEFAULT_MAYA_MESSAGES: DisplayMessage[] = [
  {
    id: 'm1',
    sender: 'them',
    text: 'Did the architecture monograph arrive yet?',
    time: '10:38 AM',
  },
  {
    id: 'm2',
    sender: 'me',
    text: 'Yes, it just came in. The print quality is incredible.',
    time: '10:39 AM',
    status: 'read',
  },
  {
    id: 'm3',
    sender: 'them',
    text: 'Look at this courtyard layout from page 42.',
    time: '10:40 AM',
  },
  {
    id: 'm4',
    sender: 'me',
    quote: {
      author: 'Maya',
      text: 'Look at this courtyard layout...',
    },
    text: 'That timber framing is stunning.',
    time: '10:41 AM',
    status: 'read',
    reaction: '❤️',
    reactionCount: 1,
  },
  {
    id: 'm5',
    sender: 'them',
    isVoice: true,
    voiceDuration: '0:42',
    time: '10:42 AM',
  },
];

export function ConversationPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerId = id || 'user_maya';

  const {
    activeChat,
    setActiveChatId,
    messages: liveMessages,
    sendMessage,
    sendMediaFile,
    deleteMessage,
    reactToMessage,
    isPartnerTyping,
    isUserOnline,
    sendTyping,
  } = useChat();

  const { startCall } = useCall();

  const [inputText, setInputText] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync active partner in ChatContext
  useEffect(() => {
    setActiveChatId(partnerId);
    return () => {
      setActiveChatId(null);
    };
  }, [partnerId, setActiveChatId]);

  // Merge live messages with fallback
  const displayMessages = useMemo<DisplayMessage[]>(() => {
    if (liveMessages.length > 0) {
      return liveMessages.map((m) => ({
        id: m.id,
        sender: m.isSent ? 'me' : 'them',
        text: m.content,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: m.status,
        photoUrl: m.mediaUrl,
        isVoice: m.type === 'voice',
        quote: m.replyQuote
          ? {
              author: m.replyQuote.name || m.replyQuote.author || 'Quote',
              text: m.replyQuote.snippet || m.replyQuote.text || '',
            }
          : undefined,
        reaction: m.reaction,
        reactionCount: m.reaction ? 1 : undefined,
      }));
    }

    if (partnerId === 'user_maya' || partnerId === '1') {
      return DEFAULT_MAYA_MESSAGES;
    }

    return [];
  }, [liveMessages, partnerId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Typing debounce
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();
    setInputText('');
    sendTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    await sendMessage(textToSend, 'text');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      await sendMediaFile(file);
    } catch (err) {
      console.error('File upload failed', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    await reactToMessage(msgId, emoji);
    setSelectedMessageId(null);
  };

  const handleDeleteForMe = async (msgId: string) => {
    await deleteMessage(msgId);
    setSelectedMessageId(null);
  };

  const toggleVoicePlayback = (id: string) => {
    setPlayingVoiceId((prev) => (prev === id ? null : id));
  };

  const isTyping = isPartnerTyping(partnerId);
  const isOnline = isUserOnline(partnerId);
  const partnerName = activeChat?.name || (partnerId === 'user_maya' || partnerId === '1' ? 'Maya Lin' : 'Conversation');
  const partnerInitials = partnerName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none relative"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
      onClick={() => {
        if (selectedMessageId) setSelectedMessageId(null);
      }}
    >
      {/* Hidden File Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Top Header Bar */}
      <header
        className="flex items-center justify-between px-3 h-[54px] shrink-0 z-30 pt-safe"
        style={{
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back"
            className="p-1 -ml-1 cursor-pointer transition-opacity hover:opacity-75"
            style={{ color: 'var(--ink)' }}
          >
            <ChevronLeft size={22} />
          </button>

          <div
            onClick={() => navigate(`/profile/${partnerId}`)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--tint-1)',
                color: 'var(--ink)',
                fontFamily: 'var(--font-serif)',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              {partnerInitials}
            </div>

            <div>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'var(--text-contact-name)',
                  letterSpacing: '-0.01em',
                  fontWeight: 500,
                  lineHeight: 1.15,
                  color: 'var(--ink)',
                }}
              >
                {partnerName}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-meta)',
                  lineHeight: 1.2,
                  color: isTyping ? 'var(--accent)' : 'var(--muted)',
                  fontWeight: isTyping ? 500 : 400,
                }}
              >
                {isTyping ? 'typing...' : isOnline ? 'Online' : 'Messages are end-to-end encrypted'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Video call contact"
            onClick={() => startCall(partnerId, partnerName, activeChat?.tint ?? 0, 'video')}
            className="p-2 cursor-pointer transition-opacity hover:opacity-75 active:scale-95"
            style={{ color: 'var(--muted)' }}
          >
            <Video size={19} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Voice call contact"
            onClick={() => startCall(partnerId, partnerName, activeChat?.tint ?? 0, 'voice')}
            className="p-2 cursor-pointer transition-opacity hover:opacity-75 active:scale-95"
            style={{ color: 'var(--muted)' }}
          >
            <Phone size={19} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Floating Reaction & Action Bar when message is selected */}
      {selectedMessageId && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleReaction(selectedMessageId, '❤️')}
            className="text-lg p-1 hover:scale-125 transition-transform"
            aria-label="Heart reaction"
          >
            ❤️
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMessageId, '👍')}
            className="text-lg p-1 hover:scale-125 transition-transform"
            aria-label="Thumbs up reaction"
          >
            👍
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMessageId, '🌿')}
            className="text-lg p-1 hover:scale-125 transition-transform"
            aria-label="Plant reaction"
          >
            🌿
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMessageId, '☕')}
            className="text-lg p-1 hover:scale-125 transition-transform"
            aria-label="Coffee reaction"
          >
            ☕
          </button>

          <span className="w-px h-4 mx-1" style={{ backgroundColor: 'var(--line)' }} />

          <button
            type="button"
            onClick={() => handleDeleteForMe(selectedMessageId)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: 'var(--heart)' }}
            aria-label="Delete message for me"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMessageId(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            style={{ color: 'var(--muted)' }}
            aria-label="Close reaction menu"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Message Stream */}
      <main className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 no-scrollbar">
        {/* Day Divider */}
        <div className="flex justify-center my-2 select-none">
          <span
            className="text-[11px] tracking-wider uppercase font-medium"
            style={{ color: 'var(--muted)' }}
          >
            TODAY
          </span>
        </div>

        {displayMessages.map((msg) => {
          // 1. SENT MESSAGE: Solid bubble in var(--sent-bubble) with white text
          if (msg.sender === 'me') {
            return (
              <div
                key={msg.id}
                className="flex flex-col items-end self-end max-w-[82%] cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMessageId((prev) => (prev === msg.id ? null : msg.id));
                }}
              >
                {/* Photo attachment if sent */}
                {msg.photoUrl && (
                  <div
                    className="mb-1.5 overflow-hidden border"
                    style={{
                      borderRadius: 'var(--radius-bubble-sent)',
                      borderColor: 'var(--line)',
                    }}
                  >
                    <img
                      src={msg.photoUrl}
                      alt="Attachment"
                      className="w-56 h-36 object-cover"
                    />
                  </div>
                )}

                <div
                  className="px-3.5 py-2.5 break-words select-text transition-opacity group-hover:opacity-95"
                  style={{
                    backgroundColor: 'var(--sent-bubble)',
                    color: 'var(--sent-bubble-ink)',
                    borderRadius: 'var(--radius-bubble-sent)',
                    fontSize: 'var(--text-message)',
                    lineHeight: 1.45,
                  }}
                >
                  {/* Quote block if reply */}
                  {msg.quote && (
                    <div
                      className="text-xs mb-1.5 pl-2 border-l-2 leading-snug"
                      style={{
                        borderColor: 'rgba(255, 255, 255, 0.6)',
                        color: 'var(--sent-bubble-ink)',
                        opacity: 0.9,
                      }}
                    >
                      <strong className="font-medium block">{msg.quote.author}</strong>
                      <span className="line-clamp-1">{msg.quote.text}</span>
                    </div>
                  )}

                  {msg.text}
                </div>

                {/* Sent Ticks & Timestamp under bubble */}
                <div className="flex items-center gap-1 mt-1 text-[11px] tnum select-none px-1" style={{ color: 'var(--muted)' }}>
                  {msg.reaction && (
                    <span className="mr-1" style={{ color: 'var(--heart)' }}>
                      {msg.reaction} {msg.reactionCount}
                    </span>
                  )}
                  <span>{msg.time}</span>
                  {msg.status === 'read' ? (
                    <CheckCheck size={14} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
                  ) : msg.status === 'delivered' ? (
                    <CheckCheck size={14} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
                  ) : (
                    <Check size={14} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
                  )}
                </div>
              </div>
            );
          }

          // 2. RECEIVED MESSAGE: NO BUBBLE — plain text on paper background (signature design!)
          return (
            <div
              key={msg.id}
              className="flex flex-col items-start self-start max-w-[82%] cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMessageId((prev) => (prev === msg.id ? null : msg.id));
              }}
            >
              {/* Photo Message */}
              {msg.photoUrl && (
                <div
                  className="mb-1.5 overflow-hidden"
                  style={{ borderRadius: 'var(--radius-sm)' }}
                >
                  <img
                    src={msg.photoUrl}
                    alt="Received attachment"
                    className="w-56 h-36 object-cover"
                  />
                </div>
              )}

              {/* Voice Message */}
              {msg.isVoice ? (
                <div
                  className="flex items-center gap-3 p-2.5 select-none transition-opacity group-hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    borderRadius: 'var(--radius-md)',
                    minWidth: '220px',
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVoicePlayback(msg.id);
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-90"
                    style={{
                      backgroundColor: 'var(--ink)',
                      color: 'var(--bg)',
                    }}
                    aria-label={playingVoiceId === msg.id ? 'Pause voice message' : 'Play voice message'}
                  >
                    {playingVoiceId === msg.id ? (
                      <Pause size={14} fill="currentColor" />
                    ) : (
                      <Play size={14} fill="currentColor" className="ml-0.5" />
                    )}
                  </button>

                  <div className="flex-1 flex items-center gap-0.5 h-4">
                    {[6, 12, 16, 8, 14, 10, 6, 12, 4, 14, 8, 4].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-xs transition-opacity duration-300"
                        style={{
                          height: `${h}px`,
                          backgroundColor: playingVoiceId === msg.id && i < 6 ? 'var(--accent)' : 'var(--ink)',
                          opacity: playingVoiceId === msg.id && i < 6 ? 1 : 0.6,
                        }}
                      />
                    ))}
                  </div>

                  <span className="text-xs tnum shrink-0" style={{ color: 'var(--muted)' }}>
                    {playingVoiceId === msg.id ? '0:18' : msg.voiceDuration || '0:42'}
                  </span>
                </div>
              ) : (
                /* Plain text received message */
                <div
                  className="select-text"
                  style={{
                    fontSize: 'var(--text-message)',
                    lineHeight: 1.45,
                    color: 'var(--ink)',
                  }}
                >
                  {msg.text}
                </div>
              )}

              {/* Timestamp & Reaction below message */}
              <div className="flex items-center gap-1.5 mt-1 text-[11px] tnum select-none" style={{ color: 'var(--muted)' }}>
                <span>{msg.time}</span>
                {msg.reaction && (
                  <span style={{ color: 'var(--heart)' }}>
                    {msg.reaction} {msg.reactionCount}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </main>

      {/* Uploading indicator */}
      {isUploading && (
        <div className="px-4 py-1.5 text-xs text-center border-t flex items-center justify-center gap-2" style={{ backgroundColor: 'var(--surface-1)', color: 'var(--muted)', borderColor: 'var(--line)' }}>
          <ImageIcon size={14} className="animate-pulse" />
          <span>Encrypting & uploading attachment...</span>
        </div>
      )}

      {/* Message Composer Area */}
      <footer
        className="p-3 shrink-0 flex items-center gap-2 pb-safe"
        style={{
          borderTop: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add attachment"
          className="p-2 cursor-pointer transition-opacity hover:opacity-75"
          style={{ color: 'var(--muted)' }}
        >
          <Plus size={20} strokeWidth={1.75} />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Message..."
          className="flex-1 px-4 py-2.5 text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--ink)',
            borderRadius: 'var(--radius-full)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-message)',
          }}
        />

        {inputText.trim() ? (
          <button
            type="button"
            onClick={handleSendMessage}
            aria-label="Send message"
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 shrink-0"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            <Send size={18} strokeWidth={2} className="ml-0.5" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Record voice note"
            onClick={async () => {
              await sendMessage('Voice message (0:15)', 'voice');
            }}
            className="p-2 cursor-pointer transition-opacity hover:opacity-75 shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <Mic size={20} strokeWidth={1.75} />
          </button>
        )}
      </footer>
    </div>
  );
}

export default ConversationPage;
