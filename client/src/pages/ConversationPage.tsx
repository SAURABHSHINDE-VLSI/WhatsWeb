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
  Trash2,
  X,
  AlertTriangle,
  ShieldAlert,
  Lock,
  ChevronDown,
  CornerUpLeft,
  Edit2,
  Copy,
  Forward,
  Star,
  Search,
  StopCircle,
} from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useCall } from '../contexts/CallContext';
import { downloadAndDecryptMedia } from '../lib/encryptedMedia';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { LinkInterstitialModal } from '../components/LinkInterstitialModal';
import { renderFormattedMessageText } from '../lib/textFormat';
import { VoiceNotePlayer } from '../components/VoiceNotePlayer';
import { AudioRecorderController, VoiceRecordingResult } from '../lib/audioRecorder';
import { saveDraftToDB, getDraftFromDB, LocalMessage } from '../lib/db';
import { searchLocalMessages } from '../lib/searchIndex';

interface DisplayMessage {
  id: string;
  sender: 'them' | 'me';
  text?: string;
  rawText?: string;
  time: string;
  createdAt: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  quote?: { author: string; text: string };
  isVoice?: boolean;
  voiceDuration?: number;
  waveform?: number[];
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
    duration?: number;
    waveform?: number[];
  } | null;
  isDecryptionFailure?: boolean;
  isEdited?: boolean;
  isDeletedForEveryone?: boolean;
  isStarred?: boolean;
  reaction?: string;
  reactionCount?: number;
  rawMsg: LocalMessage;
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
      {payload.thumbnail && !src && (
        <img
          src={payload.thumbnail}
          alt="Preview"
          className="absolute inset-0 w-full h-full object-cover filter blur-sm scale-105"
        />
      )}

      {!src && !payload.thumbnail && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)] animate-pulse">
          <Lock size={15} className="mr-1.5" />
          <span>Decrypting...</span>
        </div>
      )}

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
  onOpenLink: (url: string) => void;
}

const MessageRow = React.memo<MessageRowProps>(function MessageRow({
  msg,
  playingVoiceId,
  onSelect,
  onToggleVoice,
  onOpenLink,
}) {
  const isMe = msg.sender === 'me';

  if (isMe) {
    return (
      <div
        className="flex flex-col items-end self-end max-w-[85%] cursor-pointer group ml-auto py-1"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(msg.id);
        }}
      >
        {msg.mediaPayload && !msg.isVoice && (
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

        {msg.isDeletedForEveryone ? (
          <div
            className="px-3.5 py-2 italic text-xs select-none opacity-70 border rounded-2xl"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--muted)',
              borderColor: 'var(--line)',
            }}
          >
            This message was deleted
          </div>
        ) : msg.isVoice && msg.mediaPayload ? (
          <VoiceNotePlayer
            mediaUrl={msg.mediaPayload.mediaUrl}
            keyBase64={msg.mediaPayload.key}
            headerBase64={msg.mediaPayload.header}
            mimeType={msg.mediaPayload.mimeType}
            durationSeconds={msg.voiceDuration}
            waveform={msg.waveform}
            isPlaying={playingVoiceId === msg.id}
            onTogglePlay={() => onToggleVoice(msg.id)}
          />
        ) : (
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

            {renderFormattedMessageText(msg.text || '', onOpenLink)}

            {msg.isEdited && (
              <span className="ml-1.5 text-[10px] opacity-75 font-normal italic select-none">
                (edited)
              </span>
            )}
          </div>
        )}

        <div
          className="flex items-center gap-1 mt-1 text-[11px] tnum select-none px-1"
          style={{ color: 'var(--muted)' }}
        >
          {msg.isStarred && (
            <Star size={11} className="fill-[var(--accent)] text-[var(--accent)] mr-0.5" />
          )}
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
          ) : msg.status === 'failed' ? (
            <span title="Failed to send" className="text-[var(--heart)]">
              <AlertTriangle size={13} strokeWidth={2} />
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
      className="flex flex-col items-start self-start max-w-[85%] cursor-pointer group mr-auto py-1"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(msg.id);
      }}
    >
      {msg.mediaPayload && !msg.isVoice && (
        <div
          className="mb-1.5 overflow-hidden shadow-xs"
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <DecryptedImage payload={msg.mediaPayload} />
        </div>
      )}

      {msg.isDeletedForEveryone ? (
        <div
          className="px-3 py-1.5 italic text-xs select-none opacity-70 border rounded-2xl"
          style={{
            backgroundColor: 'var(--surface-1)',
            color: 'var(--muted)',
            borderColor: 'var(--line)',
          }}
        >
          This message was deleted
        </div>
      ) : msg.isDecryptionFailure ? (
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
      ) : msg.isVoice && msg.mediaPayload ? (
        <VoiceNotePlayer
          mediaUrl={msg.mediaPayload.mediaUrl}
          keyBase64={msg.mediaPayload.key}
          headerBase64={msg.mediaPayload.header}
          mimeType={msg.mediaPayload.mimeType}
          durationSeconds={msg.voiceDuration}
          waveform={msg.waveform}
          isPlaying={playingVoiceId === msg.id}
          onTogglePlay={() => onToggleVoice(msg.id)}
        />
      ) : (
        <div
          className="py-1 break-words select-text"
          style={{
            color: 'var(--ink)',
            fontSize: 'var(--text-message)',
            lineHeight: 1.45,
          }}
        >
          {msg.quote && (
            <div
              className="text-xs mb-1.5 pl-2 border-l-2 leading-snug"
              style={{
                borderColor: 'var(--line)',
                color: 'var(--muted)',
              }}
            >
              <strong className="font-medium block">{msg.quote.author}</strong>
              <span className="line-clamp-1">{msg.quote.text}</span>
            </div>
          )}

          {renderFormattedMessageText(msg.text || '', onOpenLink)}

          {msg.isEdited && (
            <span className="ml-1.5 text-[10px] opacity-60 font-normal italic select-none">
              (edited)
            </span>
          )}
        </div>
      )}

      <div
        className="flex items-center gap-1 mt-0.5 text-[11px] tnum select-none"
        style={{ color: 'var(--muted)' }}
      >
        {msg.isStarred && (
          <Star size={11} className="fill-[var(--accent)] text-[var(--accent)] mr-0.5" />
        )}
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
    chats,
    messages: liveMessages,
    sendMessage,
    sendMediaFile,
    sendVoiceNote,
    editMessage,
    deleteMessage,
    deleteMessageForEveryone,
    reactToMessage,
    toggleStarMessage,
    forwardMessage,
    retryFailedMessage,
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

  // Phase B States: Reply, Edit, Forward, Interstitial, Recording, Search
  const [replyTarget, setReplyTarget] = useState<DisplayMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DisplayMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DisplayMessage | null>(null);
  const [interstitialUrl, setInterstitialUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState<DisplayMessage | null>(null);

  // In-chat search
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; snippet: string }[]>([]);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<AudioRecorderController | null>(null);

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

  // Load draft on partner change
  useEffect(() => {
    if (partnerId) {
      getDraftFromDB(partnerId).then((draft) => {
        if (draft) setInputText(draft);
      });
    }
  }, [partnerId]);

  // Toast feedback helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

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
        rawText: m.content,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: m.createdAt,
        status: m.status,
        photoUrl: mediaPayload ? mediaPayload.mediaUrl : m.mediaUrl,
        mediaPayload,
        isDecryptionFailure,
        isVoice: m.type === 'voice',
        voiceDuration: mediaPayload?.duration || m.voiceDuration,
        waveform: mediaPayload?.waveform || m.waveform,
        isEdited: m.isEdited,
        isDeletedForEveryone: m.isDeletedForEveryone,
        isStarred: m.isStarred,
        quote: m.replyQuote
          ? {
              author: m.replyQuote.name || m.replyQuote.author || 'Quote',
              text: m.replyQuote.snippet || m.replyQuote.text || '',
            }
          : undefined,
        reaction: m.reaction,
        reactionCount: m.reaction ? 1 : undefined,
        rawMsg: m,
      };
    });
  }, [liveMessages]);

  // In-chat search execution
  useEffect(() => {
    if (!isSearching || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const res = searchLocalMessages(searchQuery, partnerId);
    setSearchResults(res);
  }, [isSearching, searchQuery, partnerId]);

  // TanStack Virtualizer
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

  // Scroll anchoring: pin to bottom on new message if user was already at bottom
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
  }, [partnerId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setSendError(null);

    // Save draft to IndexedDB
    if (partnerId) {
      saveDraftToDB(partnerId, val).catch(() => {});
    }

    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText.trim();

    // If editing an existing message
    if (editingMessage) {
      try {
        await editMessage(editingMessage.id, textToSend);
        setEditingMessage(null);
        setInputText('');
        showToast('Message edited');
      } catch (err: any) {
        setSendError(err.message || 'Failed to edit message');
      }
      return;
    }

    setInputText('');
    setSendError(null);
    sendTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (partnerId) saveDraftToDB(partnerId, '').catch(() => {});

    try {
      await sendMessage(
        textToSend,
        'text',
        replyTarget
          ? {
              author: replyTarget.sender === 'me' ? 'You' : partnerName,
              snippet: replyTarget.text || 'Attachment',
            }
          : undefined
      );
      setReplyTarget(null);
      scrollToBottom('smooth');
    } catch (err: any) {
      setSendError(err.message || 'Failed to send message');
    }
  };

  // Voice recording controls
  const handleStartVoiceRecording = async () => {
    try {
      recorderRef.current = new AudioRecorderController();
      await recorderRef.current.startRecording((sec) => {
        setRecordingSeconds(Math.floor(sec));
      });
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (err: any) {
      setSendError(err.message || 'Microphone recording error');
    }
  };

  const handleStopAndSendVoice = async () => {
    if (!recorderRef.current) return;
    try {
      setIsRecording(false);
      const res: VoiceRecordingResult = await recorderRef.current.stopRecording();
      await sendVoiceNote(res);
      scrollToBottom('smooth');
    } catch (err: any) {
      setSendError(err.message || 'Failed to record voice note');
    }
  };

  const handleCancelVoiceRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.cancelRecording();
      setIsRecording(false);
      setRecordingSeconds(0);
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

  // Message actions
  const selectedMsg = useMemo(() => {
    return displayMessages.find((m) => m.id === selectedMessageId) || null;
  }, [displayMessages, selectedMessageId]);

  const isEditable = useMemo(() => {
    if (!selectedMsg || selectedMsg.sender !== 'me' || selectedMsg.isDeletedForEveryone) return false;
    const ageMs = Date.now() - new Date(selectedMsg.createdAt).getTime();
    return ageMs <= 15 * 60 * 1000;
  }, [selectedMsg]);

  const handleReaction = async (msgId: string, emoji: string) => {
    await reactToMessage(msgId, emoji);
    setSelectedMessageId(null);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
    setSelectedMessageId(null);
  };

  const handleStartReply = (msg: DisplayMessage) => {
    setReplyTarget(msg);
    setSelectedMessageId(null);
  };

  const handleStartEdit = (msg: DisplayMessage) => {
    setEditingMessage(msg);
    setInputText(msg.text || '');
    setSelectedMessageId(null);
  };

  const handleToggleStar = async (msgId: string) => {
    const starred = await toggleStarMessage(msgId);
    showToast(starred ? 'Starred message' : 'Unstarred message');
    setSelectedMessageId(null);
  };

  const handleForwardSelect = (msg: DisplayMessage) => {
    setForwardingMessage(msg);
    setSelectedMessageId(null);
  };

  const handleExecuteForward = async (targetId: string) => {
    if (!forwardingMessage) return;
    try {
      await forwardMessage(forwardingMessage.rawMsg, targetId);
      showToast('Forwarded message');
      setForwardingMessage(null);
    } catch (err: any) {
      setSendError(err.message || 'Failed to forward message');
    }
  };

  const handleDeleteForMe = async (msgId: string) => {
    await deleteMessage(msgId);
    setSelectedMessageId(null);
    showToast('Deleted for you');
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try {
      await deleteMessageForEveryone(msgId);
      setDeleteConfirmMsg(null);
      setSelectedMessageId(null);
      showToast('Deleted for everyone');
    } catch (err: any) {
      setSendError(err.message || 'Failed to delete message');
    }
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
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-medium shadow-lg border backdrop-blur-md animate-in fade-in zoom-in-95"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Safety Interstitial Modal for External Links */}
      <LinkInterstitialModal
        url={interstitialUrl}
        onClose={() => setInterstitialUrl(null)}
      />

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
            aria-label="Search in conversation"
            onClick={() => setIsSearching((prev) => !prev)}
            className="p-2 cursor-pointer transition-opacity hover:opacity-75"
            style={{ color: isSearching ? 'var(--accent)' : 'var(--muted)' }}
          >
            <Search size={18} strokeWidth={1.75} />
          </button>
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

      {/* In-Chat Search Bar */}
      {isSearching && (
        <div
          className="px-3 py-2 border-b flex items-center gap-2 z-30 animate-in slide-in-from-top-2 duration-150"
          style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--line)' }}
        >
          <Search size={15} style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages on this device only..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--ink)' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 text-xs opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsSearching(false);
              setSearchQuery('');
            }}
            className="text-xs px-2 py-0.5 rounded font-medium hover:bg-black/5"
            style={{ color: 'var(--muted)' }}
          >
            Done
          </button>
        </div>
      )}

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

      {/* Floating Action Menu when a message is selected */}
      {selectedMsg && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-xl border backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reaction Emojis */}
          <button
            type="button"
            onClick={() => handleReaction(selectedMsg.id, '❤️')}
            className="text-base p-1 hover:scale-125 transition-transform"
            aria-label="Heart reaction"
          >
            ❤️
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMsg.id, '👍')}
            className="text-base p-1 hover:scale-125 transition-transform"
            aria-label="Thumbs up reaction"
          >
            👍
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMsg.id, '🌿')}
            className="text-base p-1 hover:scale-125 transition-transform"
            aria-label="Plant reaction"
          >
            🌿
          </button>
          <button
            type="button"
            onClick={() => handleReaction(selectedMsg.id, '🔥')}
            className="text-base p-1 hover:scale-125 transition-transform"
            aria-label="Fire reaction"
          >
            🔥
          </button>

          <div className="w-[1px] h-4 mx-0.5" style={{ backgroundColor: 'var(--line)' }} />

          {/* Reply */}
          <button
            type="button"
            onClick={() => handleStartReply(selectedMsg)}
            className="p-1 hover:text-[var(--accent)] transition-colors"
            title="Reply"
          >
            <CornerUpLeft size={15} />
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={() => handleCopyText(selectedMsg.text || '')}
            className="p-1 hover:text-[var(--accent)] transition-colors"
            title="Copy"
          >
            <Copy size={15} />
          </button>

          {/* Forward */}
          <button
            type="button"
            onClick={() => handleForwardSelect(selectedMsg)}
            className="p-1 hover:text-[var(--accent)] transition-colors"
            title="Forward"
          >
            <Forward size={15} />
          </button>

          {/* Star */}
          <button
            type="button"
            onClick={() => handleToggleStar(selectedMsg.id)}
            className="p-1 hover:text-[var(--accent)] transition-colors"
            title={selectedMsg.isStarred ? 'Unstar' : 'Star'}
          >
            <Star size={15} className={selectedMsg.isStarred ? 'fill-[var(--accent)] text-[var(--accent)]' : ''} />
          </button>

          {/* Edit (only if sender and < 15 min old) */}
          {isEditable && (
            <button
              type="button"
              onClick={() => handleStartEdit(selectedMsg)}
              className="p-1 hover:text-[var(--accent)] transition-colors"
              title="Edit (within 15 minutes)"
            >
              <Edit2 size={15} />
            </button>
          )}

          {/* Delete options */}
          <button
            type="button"
            onClick={() => setDeleteConfirmMsg(selectedMsg)}
            className="p-1 hover:text-[var(--heart)] transition-colors"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>

          <button
            type="button"
            onClick={() => setSelectedMessageId(null)}
            className="p-1 opacity-60 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmMsg && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setDeleteConfirmMsg(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 shadow-2xl border flex flex-col gap-3 animate-in zoom-in-95"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold">Delete Message</h3>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {deleteConfirmMsg.sender === 'me'
                ? 'Delete this message for everyone or only from your device? (Delete for everyone is best-effort).'
                : 'Delete this message from your device?'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              {deleteConfirmMsg.sender === 'me' && (
                <button
                  type="button"
                  onClick={() => handleDeleteForEveryone(deleteConfirmMsg.id)}
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-[var(--heart)] text-white cursor-pointer active:scale-98"
                >
                  Delete for Everyone
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDeleteForMe(deleteConfirmMsg.id)}
                className="w-full py-2 rounded-xl text-xs font-medium border cursor-pointer hover:bg-black/5"
                style={{ borderColor: 'var(--line)' }}
              >
                Delete for Me
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmMsg(null)}
                className="w-full py-1.5 text-xs opacity-75 hover:opacity-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setForwardingMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl border flex flex-col gap-4 animate-in zoom-in-95 max-h-[80vh]"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Forward Message To</h3>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="p-1 opacity-60 hover:opacity-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
              {chats
                .filter((c) => c.id !== partnerId)
                .map((chat) => (
                  <div
                    key={chat.id}
                    className="flex items-center justify-between p-2 rounded-xl border hover:bg-black/5 cursor-pointer transition-colors"
                    style={{ borderColor: 'var(--line)' }}
                    onClick={() => handleExecuteForward(chat.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{
                          backgroundColor: `var(--tint-${((chat.tint || 0) % 4) + 1}, #D9CDB8)`,
                          color: '#1D1B18',
                        }}
                      >
                        {(chat.name || chat.username || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-medium">{chat.name || chat.username}</span>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-xs rounded-lg font-semibold bg-[var(--accent)] text-[var(--accent-ink)]"
                    >
                      Send
                    </button>
                  </div>
                ))}
              {chats.filter((c) => c.id !== partnerId).length === 0 && (
                <div className="py-8 text-center text-xs opacity-60">
                  No other active chats to forward to.
                </div>
              )}
            </div>
          </div>
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
                    onOpenLink={(url) => setInterstitialUrl(url)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Jump to latest button */}
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

      {/* Upload Progress Bar */}
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

      {/* Quoted Reply Banner above composer */}
      {replyTarget && (
        <div
          className="px-4 py-2 flex items-center justify-between border-t z-30 text-xs animate-in slide-in-from-bottom-2 duration-150"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <CornerUpLeft size={14} className="shrink-0 text-[var(--accent)]" />
            <div className="overflow-hidden">
              <span className="font-semibold block text-[11px]" style={{ color: 'var(--accent)' }}>
                Replying to {replyTarget.sender === 'me' ? 'yourself' : partnerName}
              </span>
              <span className="truncate block text-xs opacity-75">
                {replyTarget.text || 'Attachment'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="p-1 opacity-60 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Editing Banner above composer */}
      {editingMessage && (
        <div
          className="px-4 py-2 flex items-center justify-between border-t z-30 text-xs animate-in slide-in-from-bottom-2 duration-150"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
            color: 'var(--ink)',
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Edit2 size={14} className="shrink-0 text-[var(--accent)]" />
            <span className="font-semibold text-xs text-[var(--accent)]">
              Editing message (15-min window)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
            className="p-1 opacity-60 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bottom Composer Bar / Voice Recorder Bar */}
      <footer
        className="px-3 py-2 shrink-0 z-30 pb-safe"
        style={{
          borderTop: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        {isRecording ? (
          /* Active Voice Note Recorder Bar */
          <div className="flex items-center justify-between max-w-4xl mx-auto w-full px-2 py-1">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-[var(--heart)] animate-pulse" />
              <span className="text-xs font-mono font-semibold text-[var(--heart)]">
                {Math.floor(recordingSeconds / 60)}:
                {(recordingSeconds % 60).toString().padStart(2, '0')} / 5:00
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelVoiceRecording}
                className="p-2 text-[var(--heart)] hover:bg-black/5 rounded-full cursor-pointer"
                title="Discard recording"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                onClick={handleStopAndSendVoice}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[var(--accent)] text-[var(--accent-ink)] cursor-pointer active:scale-95 shadow-md"
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Text Composer */
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <button
              type="button"
              aria-label="Attach photo or audio"
              disabled={isUploading || Boolean(safetyNumberWarning)}
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
                  safetyNumberWarning
                    ? 'Verify safety number to send'
                    : editingMessage
                    ? 'Edit your message...'
                    : 'Write a message...'
                }
                disabled={Boolean(safetyNumberWarning)}
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
                aria-label={editingMessage ? 'Save edited message' : 'Send message'}
                disabled={Boolean(safetyNumberWarning)}
                onClick={handleSendMessage}
                className="p-2 rounded-full cursor-pointer transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-ink)',
                }}
              >
                {editingMessage ? <Check size={16} strokeWidth={2.5} /> : <Send size={16} strokeWidth={2} />}
              </button>
            ) : (
              <button
                type="button"
                aria-label="Record voice note"
                disabled={Boolean(safetyNumberWarning)}
                onClick={handleStartVoiceRecording}
                className="p-2 cursor-pointer transition-opacity hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: 'var(--muted)' }}
                title="Tap to record voice message"
              >
                <Mic size={19} strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

export default ConversationPage;
