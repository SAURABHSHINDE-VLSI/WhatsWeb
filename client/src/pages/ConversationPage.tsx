import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronLeft,
  Phone,
  Video,
  Plus,
  Mic,
  Send,
  Clock,
  Check,
  CheckCheck,
  Play,
  Pause,
  Trash2,
  X,
  AlertTriangle,
  ShieldAlert,
  Lock,
  ChevronDown,
} from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useCall } from '../contexts/CallContext';
import { downloadAndDecryptMedia } from '../lib/encryptedMedia';
import { ConnectionBanner } from '../components/ConnectionBanner';

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
  mediaPayload?: {
    mediaUrl: string;
    key: string;
    header: string;
    mimeType: string;
    caption?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
  } | null;
  isDecryptionFailure?: boolean;
  reaction?: string;
  reactionCount?: number;
}

// Progressive image with instant 32x32 blurred thumbnail preview while worker decrypts
const DecryptedImage = React.memo(function DecryptedImage({
  payload,
}: {
  payload: {
    mediaUrl: string;
    key: string;
    header: string;
    mimeType: string;
    thumbnail?: string;
    width?: number;
    height?: number;
  };
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    downloadAndDecryptMedia(payload.mediaUrl, payload.key, payload.header, payload.mimeType)
      .then((url) => {
        if (mounted) setSrc(url);
      })
      .catch(() => {
        if (mounted) setError(true);
      });

    return () => {
      mounted = false;
    };
  }, [payload.mediaUrl, payload.key, payload.header, payload.mimeType]);

  if (error) {
    return (
      <div className="w-60 h-40 flex flex-col items-center justify-center p-3 text-center bg-black/10 text-xs text-[var(--heart)]">
        <ShieldAlert size={20} className="mb-1" />
        <span>Failed to decrypt media</span>
      </div>
    );
  }

  return (
    <div className="relative w-60 h-40 overflow-hidden bg-black/5 rounded-lg">
      {/* Instant blurred thumbnail placeholder */}
      {payload.thumbnail && !src && (
        <img
          src={payload.thumbnail}
          alt="Preview"
          className="absolute inset-0 w-full h-full object-cover filter blur-sm scale-105"
        />
      )}

      {/* Loading state indicator if no thumbnail */}
      {!src && !payload.thumbnail && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)] animate-pulse">
          <Lock size={15} className="mr-1.5" />
          <span>Decrypting...</span>
        </div>
      )}

      {/* Full decrypted image */}
      {src && (
        <img
          src={src}
          alt="Decrypted media"
          className="relative w-full h-full object-cover transition-opacity duration-200"
          style={{ opacity: src ? 1 : 0 }}
        />
      )}
    </div>
  );
});

// Memoized single message row
interface MessageRowProps {
  msg: DisplayMessage;
  isSelected: boolean;
  playingVoiceId: string | null;
  onSelect: (id: string) => void;
  onToggleVoice: (id: string) => void;
}

const MessageRow = React.memo<MessageRowProps>(function MessageRow({
  msg,
  playingVoiceId,
  onSelect,
  onToggleVoice,
}) {
  const isMe = msg.sender === 'me';

  if (isMe) {
    return (
      <div
        className="flex flex-col items-end self-end max-w-[82%] cursor-pointer group ml-auto py-1"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(msg.id);
        }}
      >
        {msg.mediaPayload && (
          <div
            className="mb-1.5 overflow-hidden border shadow-xs"
            style={{
              borderRadius: 'var(--radius-bubble-sent)',
              borderColor: 'var(--line)',
            }}
          >
            <DecryptedImage payload={msg.mediaPayload} />
          </div>
        )}

        <div
          className="px-3.5 py-2.5 break-words select-text transition-opacity group-hover:opacity-95 shadow-xs"
          style={{
            backgroundColor: 'var(--sent-bubble)',
            color: 'var(--sent-bubble-ink)',
            borderRadius: 'var(--radius-bubble-sent)',
            fontSize: 'var(--text-message)',
            lineHeight: 1.45,
          }}
        >
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

        <div
          className="flex items-center gap-1 mt-1 text-[11px] tnum select-none px-1"
          style={{ color: 'var(--muted)' }}
        >
          {msg.reaction && (
            <span className="mr-1" style={{ color: 'var(--heart)' }}>
              {msg.reaction} {msg.reactionCount}
            </span>
          )}
          <span>{msg.time}</span>
          {msg.status === 'pending' ? (
            <span title="Queued offline">
              <Clock size={13} strokeWidth={1.8} style={{ color: 'var(--muted)' }} />
            </span>
          ) : msg.status === 'read' ? (
            <span title="Read">
              <CheckCheck size={14} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
            </span>
          ) : msg.status === 'delivered' ? (
            <span title="Delivered">
              <CheckCheck size={14} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
            </span>
          ) : (
            <span title="Sent">
              <Check size={14} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
            </span>
          )}
        </div>
      </div>
    );
  }

  // Received message
  return (
    <div
      className="flex flex-col items-start self-start max-w-[82%] cursor-pointer group mr-auto py-1"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(msg.id);
      }}
    >
      {msg.mediaPayload && (
        <div
          className="mb-1.5 overflow-hidden shadow-xs"
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <DecryptedImage payload={msg.mediaPayload} />
        </div>
      )}

      {msg.isDecryptionFailure ? (
        <div
          className="flex items-center gap-2 p-2.5 rounded-xl text-xs"
          style={{
            backgroundColor: 'rgba(180, 69, 47, 0.1)',
            color: 'var(--heart)',
            border: '1px solid rgba(180, 69, 47, 0.25)',
          }}
        >
          <ShieldAlert size={16} className="shrink-0" />
          <span>Could not decrypt message — ask contact to resend</span>
        </div>
      ) : msg.isVoice ? (
        <div
          className="flex items-center gap-3 p-2.5 select-none transition-opacity group-hover:opacity-90 shadow-xs"
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
              onToggleVoice(msg.id);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-90"
            style={{
              backgroundColor: 'var(--ink)',
              color: 'var(--bg)',
            }}
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
                  backgroundColor:
                    playingVoiceId === msg.id && i < 6 ? 'var(--accent)' : 'var(--ink)',
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
        <div
          className="py-1 break-words select-text"
          style={{
            color: 'var(--ink)',
            fontSize: 'var(--text-message)',
            lineHeight: 1.45,
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        className="flex items-center gap-1 mt-0.5 text-[11px] tnum select-none"
        style={{ color: 'var(--muted)' }}
      >
        <span>{msg.time}</span>
        {msg.reaction && (
          <span className="ml-1" style={{ color: 'var(--heart)' }}>
            {msg.reaction} {msg.reactionCount}
          </span>
        )}
      </div>
    </div>
  );
});

export function ConversationPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerId = id || '';

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
    safetyNumberWarning,
    acknowledgeSafetyNumber,
    wsStatus,
  } = useChat();

  const { startCall } = useCall();

  const [inputText, setInputText] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);

  // Scroll tracking and anchoring
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousMessageCount = useRef(0);

  // Sync active partner in ChatContext
  useEffect(() => {
    if (partnerId) {
      setActiveChatId(partnerId);
    }
    return () => {
      setActiveChatId(null);
    };
  }, [partnerId, setActiveChatId]);

  // Transform live decrypted messages from local IndexedDB
  const displayMessages = useMemo<DisplayMessage[]>(() => {
    return liveMessages.map((m) => {
      const isMedia = m.type === 'photo' || m.type === 'voice';
      let displayText = m.content;
      let mediaPayload: any = null;

      if (isMedia && m.content.startsWith('{')) {
        try {
          mediaPayload = JSON.parse(m.content);
          displayText = mediaPayload.caption || '';
        } catch (e) {}
      }

      const isDecryptionFailure = m.content.includes('[Could not decrypt message');

      return {
        id: m.id,
        sender: m.isSent ? 'me' : 'them',
        text: displayText,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: m.status,
        photoUrl: mediaPayload ? mediaPayload.mediaUrl : m.mediaUrl,
        mediaPayload,
        isDecryptionFailure,
        isVoice: m.type === 'voice',
        quote: m.replyQuote
          ? {
              author: m.replyQuote.name || m.replyQuote.author || 'Quote',
              text: m.replyQuote.snippet || m.replyQuote.text || '',
            }
          : undefined,
        reaction: m.reaction,
        reactionCount: m.reaction ? 1 : undefined,
      };
    });
  }, [liveMessages]);

  // TanStack Virtualizer with dynamic measurement
  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  });

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      if (displayMessages.length === 0) return;
      virtualizer.scrollToIndex(displayMessages.length - 1, { align: 'end', behavior });
      setUnseenCount(0);
    },
    [displayMessages.length, virtualizer]
  );

  // Scroll listener to update isAtBottom state
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 80;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnseenCount(0);
    }
  }, []);

  // Scroll anchoring: pin to bottom on new message if user is already at bottom
  useEffect(() => {
    const currentCount = displayMessages.length;
    const diff = currentCount - previousMessageCount.current;
    previousMessageCount.current = currentCount;

    if (diff > 0) {
      if (isAtBottom) {
        scrollToBottom('smooth');
      } else {
        setUnseenCount((prev) => prev + diff);
      }
    }
  }, [displayMessages.length, isAtBottom, scrollToBottom]);

  // Initial scroll to bottom on mount / chat open
  useEffect(() => {
    if (displayMessages.length > 0) {
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [partnerId]); // Run once when chat opens

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setSendError(null);

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
    setSendError(null);
    sendTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      await sendMessage(textToSend, 'text');
      scrollToBottom('smooth');
    } catch (err: any) {
      setSendError(err.message || 'Failed to send message');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setSendError(null);
      await sendMediaFile(file, {
        onProgress: (pct) => setUploadProgress(pct),
      });
      scrollToBottom('smooth');
    } catch (err: any) {
      setSendError(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
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

  const toggleVoicePlayback = useCallback((id: string) => {
    setPlayingVoiceId((prev) => (prev === id ? null : id));
  }, []);

  const selectMessage = useCallback((id: string) => {
    setSelectedMessageId((prev) => (prev === id ? null : id));
  }, []);

  const isTyping = isPartnerTyping(partnerId);
  const isOnline = isUserOnline(partnerId);
  const partnerName = activeChat?.name || activeChat?.username || 'Conversation';
  const partnerInitials = partnerName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none relative animate-slide-in"
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
            onClick={() => navigate(`/security/${partnerId}`)}
            className="flex items-center gap-2.5 cursor-pointer"
            title="View Security & Safety Numbers"
          >
            <div
              className="flex items-center justify-center shrink-0"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: `var(--tint-${((activeChat?.tint || 0) % 4) + 1}, #D9CDB8)`,
                color: '#1D1B18',
                fontFamily: 'var(--font-serif)',
                fontSize: '14px',
                fontWeight: 600,
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
                {isTyping ? 'typing...' : isOnline ? 'Online' : 'Signal E2EE Active'}
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

      {/* Network Offline / Reconnecting Banner */}
      <ConnectionBanner status={wsStatus} />

      {/* Safety Number Changed Warning Banner */}
      {safetyNumberWarning && (
        <div
          className="px-4 py-2.5 flex items-center justify-between text-xs z-30 shadow-xs"
          style={{
            backgroundColor: 'rgba(180, 69, 47, 0.12)',
            borderBottom: '1px solid rgba(180, 69, 47, 0.3)',
            color: 'var(--heart)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>Safety number changed for this contact. Sending is blocked.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate(`/security/${partnerId}`)}
              className="underline font-semibold cursor-pointer"
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => acknowledgeSafetyNumber(partnerId)}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--heart)] text-white cursor-pointer"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Send Error Notice */}
      {sendError && (
        <div
          className="px-4 py-2 text-xs flex items-center justify-between z-30"
          style={{ backgroundColor: 'rgba(180, 69, 47, 0.1)', color: 'var(--heart)' }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} />
            <span>{sendError}</span>
          </div>
          <button type="button" onClick={() => setSendError(null)} className="cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

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
          <div className="w-[1px] h-4 mx-1" style={{ backgroundColor: 'var(--line)' }} />
          <button
            type="button"
            onClick={() => handleDeleteForMe(selectedMessageId)}
            className="p-1 text-xs flex items-center gap-1 hover:text-[var(--heart)] transition-colors"
            title="Delete from this device"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSelectedMessageId(null)}
            className="p-1 text-xs opacity-60 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Virtualized Message Scroll Container */}
      <main
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 no-scrollbar relative"
        style={{ overflowAnchor: 'none' }}
      >
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-2 select-none opacity-60">
            <Lock size={20} style={{ color: 'var(--accent)' }} />
            <p className="text-xs max-w-xs font-serif" style={{ color: 'var(--muted)' }}>
              End-to-End Encrypted conversation started. All correspondence is protected by the Double Ratchet.
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const msg = displayMessages[virtualRow.index];
              return (
                <div
                  key={msg.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <MessageRow
                    msg={msg}
                    isSelected={selectedMessageId === msg.id}
                    playingVoiceId={playingVoiceId}
                    onSelect={selectMessage}
                    onToggleVoice={toggleVoicePlayback}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Jump to latest button with unread count badge */}
      {!isAtBottom && displayMessages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          aria-label="Jump to latest message"
          className="absolute bottom-20 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg border backdrop-blur-md cursor-pointer transition-transform active:scale-95 animate-in fade-in"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
        >
          <ChevronDown size={16} />
          {unseenCount > 0 && (
            <span
              className="px-1.5 py-0.2 rounded-full text-[11px] font-bold"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              {unseenCount}
            </span>
          )}
        </button>
      )}

      {/* Upload Progress Bar if uploading chunked media */}
      {isUploading && (
        <div
          className="px-4 py-1.5 flex items-center justify-between text-xs z-30 animate-pulse border-t"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
            color: 'var(--muted)',
          }}
        >
          <span>Encrypting & uploading media...</span>
          <span className="font-semibold text-[var(--accent)]">{uploadProgress}%</span>
        </div>
      )}

      {/* Bottom Composer Bar */}
      <footer
        className="px-3 py-2 shrink-0 z-30 pb-safe"
        style={{
          borderTop: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
          <button
            type="button"
            aria-label="Attach photo or audio"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="p-2 cursor-pointer transition-opacity hover:opacity-75 disabled:opacity-50"
            style={{ color: 'var(--muted)' }}
          >
            <Plus size={20} strokeWidth={2} />
          </button>

          <div
            className="flex-1 flex items-center px-3.5 py-2 rounded-full border transition-all"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                safetyNumberWarning ? 'Verify safety number to send' : 'Write a message...'
              }
              disabled={safetyNumberWarning}
              className="w-full bg-transparent outline-none text-sm disabled:cursor-not-allowed"
              style={{
                color: 'var(--ink)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          {inputText.trim() ? (
            <button
              type="button"
              aria-label="Send message"
              disabled={safetyNumberWarning}
              onClick={handleSendMessage}
              className="p-2 rounded-full cursor-pointer transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              <Send size={16} strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Record voice note"
              disabled={safetyNumberWarning}
              onClick={() =>
                alert('Press and hold to record audio (encrypted with crypto_secretstream)')
              }
              className="p-2 cursor-pointer transition-opacity hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: 'var(--muted)' }}
            >
              <Mic size={19} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default ConversationPage;
