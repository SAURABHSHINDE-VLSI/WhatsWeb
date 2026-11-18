import React from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Play, Pause } from 'lucide-react';

export interface ReplyQuote {
  name?: string;
  author?: string;
  snippet?: string;
  text?: string;
}

export interface ReactionItem {
  emoji: string;
  count?: number;
}

export interface MessageBubbleProps {
  id?: string;
  sender?: 'me' | 'them' | string;
  content?: React.ReactNode;
  text?: string;
  timestamp?: string;
  time?: string;
  isSent?: boolean;
  isRead?: boolean;
  showTicks?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  replyTo?: ReplyQuote | string;
  replyQuote?: ReplyQuote | string;
  quote?: any;
  reaction?: ReactionItem | string;
  reactions?: any;
  type?: 'text' | 'photo' | 'voice' | 'sent' | 'received';
  photo?: string;
  imageUrl?: string;
  media?: string;
  photoUrl?: string;
  hasVoice?: boolean;
  isVoice?: boolean;
  voiceDuration?: string;
  duration?: string;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  isConsecutive?: boolean;
  className?: string;
}

export function MessageBubble({
  id: _id,
  sender,
  content,
  text,
  timestamp,
  time,
  isSent: isSentProp,
  isRead = false,
  showTicks,
  status,
  replyTo,
  replyQuote,
  quote,
  reaction,
  reactions,
  type = 'text',
  photo,
  imageUrl,
  media,
  photoUrl,
  hasVoice,
  isVoice,
  voiceDuration = '0:42',
  duration,
  isPlaying = false,
  onPlayPause,
  isConsecutive = false,
  className = '',
}: MessageBubbleProps) {
  const isSent =
    isSentProp !== undefined
      ? isSentProp
      : sender === 'me' || type === 'sent';

  const actualTime = timestamp || time || '';
  const actualContent = content || text;
  const actualPhoto = photoUrl || imageUrl || photo || media;
  const actualDuration = duration || voiceDuration;

  let resolvedType: 'text' | 'photo' | 'voice' = 'text';
  if (hasVoice || isVoice || type === 'voice') {
    resolvedType = 'voice';
  } else if (actualPhoto || type === 'photo') {
    resolvedType = 'photo';
  }

  const shouldShowTicks = showTicks !== undefined ? showTicks : isSent;

  // Resolve status: 'read' > 'delivered' > 'sent'
  const resolvedStatus: 'sent' | 'delivered' | 'read' =
    status || (isRead ? 'read' : 'delivered');

  // Reply formatting
  const rawReply = replyTo || replyQuote || quote;
  const replyData: ReplyQuote | null = (() => {
    if (!rawReply) return null;
    if (typeof rawReply === 'string') return { snippet: rawReply };
    return {
      name: rawReply.name || rawReply.author,
      snippet: rawReply.snippet || rawReply.text || '',
    };
  })();

  // Reaction formatting
  const rawReaction = reaction || reactions;
  const reactionData: ReactionItem | null = (() => {
    if (!rawReaction) return null;
    if (typeof rawReaction === 'string') return { emoji: rawReaction };
    if (Array.isArray(rawReaction) && rawReaction.length > 0) {
      const first = rawReaction[0];
      return typeof first === 'string' ? { emoji: first } : first;
    }
    if (typeof rawReaction === 'object' && rawReaction.emoji) return rawReaction;
    return null;
  })();

  // Render ticks with lucide-react (strokeWidth={1.75})
  const renderTicks = () => {
    if (!shouldShowTicks) return null;

    if (resolvedStatus === 'sent') {
      return (
        <Check
          size={13}
          strokeWidth={1.75}
          className="shrink-0"
          style={{ color: isSent ? 'var(--muted)' : 'var(--muted)' }}
          aria-label="Sent"
        />
      );
    }

    if (resolvedStatus === 'delivered') {
      return (
        <CheckCheck
          size={13}
          strokeWidth={1.75}
          className="shrink-0"
          style={{ color: isSent ? 'var(--muted)' : 'var(--muted)' }}
          aria-label="Delivered"
        />
      );
    }

    // Read: double check in accent
    return (
      <CheckCheck
        size={13}
        strokeWidth={1.75}
        className="shrink-0"
        style={{ color: 'var(--accent)' }}
        aria-label="Read"
      />
    );
  };

  // Voice note UI inside surface-1 pill
  const renderVoiceNote = () => (
    <div
      className="flex items-center gap-[10px] rounded-[16px] px-[14px] py-[9px] w-[220px] max-w-full select-none"
      style={{
        backgroundColor: 'var(--surface-1)',
        color: 'var(--ink)',
      }}
    >
      <button
        type="button"
        onClick={onPlayPause}
        className="w-[30px] h-[30px] min-w-[30px] rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 shrink-0"
        style={{
          backgroundColor: 'var(--ink)',
          color: 'var(--bg)',
        }}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause size={14} strokeWidth={1.75} style={{ fill: 'var(--bg)' }} />
        ) : (
          <Play
            size={14}
            strokeWidth={1.75}
            style={{ fill: 'var(--bg)', marginLeft: '2px' }}
          />
        )}
      </button>

      {/* Waveform bars */}
      <div className="flex-1 flex items-center gap-[2px] h-[18px]">
        {[5, 14, 18, 10, 16, 8, 12, 5].map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-[2px]"
            style={{
              height: `${h}px`,
              backgroundColor: 'var(--ink)',
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      {/* Duration */}
      <span
        className="tnum shrink-0"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          color: 'var(--muted)',
        }}
      >
        {actualDuration}
      </span>
    </div>
  );

  // Reaction badge under bubble/message
  const renderReaction = () => {
    if (!reactionData) return null;
    return (
      <div
        className="inline-flex items-center gap-[3px] select-none"
        style={{
          color: 'var(--heart)',
          fontSize: '12px',
        }}
      >
        <span>{reactionData.emoji}</span>
        {reactionData.count !== undefined && (
          <span
            className="font-medium tnum"
            style={{ fontSize: '11px', fontFamily: 'var(--font-sans)' }}
          >
            {reactionData.count}
          </span>
        )}
      </div>
    );
  };

  // Reply Quote Box
  const renderReplyQuote = () => {
    if (!replyData) return null;
    return (
      <div
        className="text-[13px] mb-[6px] pl-[8px] border-l-[2px] leading-snug"
        style={{
          borderColor: isSent ? 'rgba(255, 255, 255, 0.6)' : 'var(--line)',
          color: isSent ? 'var(--sent-bubble-ink)' : 'var(--muted)',
          opacity: 0.9,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {replyData.name && (
          <strong className="font-semibold block">{replyData.name}</strong>
        )}
        <span className="line-clamp-2">{replyData.snippet}</span>
      </div>
    );
  };

  // Group consecutive messages by reducing gap (4px vs 14px)
  const topMarginClass = isConsecutive ? 'mt-[4px]' : 'mt-[14px]';

  // SENT MESSAGE
  if (isSent) {
    return (
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={`flex flex-col items-end self-end max-w-[82%] relative ${topMarginClass} ${className}`}
      >
        {/* Solid Sent Bubble */}
        <div
          className="break-words select-text"
          style={{
            backgroundColor: 'var(--sent-bubble)',
            color: 'var(--sent-bubble-ink)',
            borderRadius: 'var(--radius-bubble-sent, 20px 20px 4px 20px)',
            padding: '10px 14px',
            fontSize: '16px',
            lineHeight: 1.45,
            fontFamily: 'var(--font-sans)',
            maxWidth: '100%',
          }}
        >
          {renderReplyQuote()}

          {/* Photo type */}
          {resolvedType === 'photo' && actualPhoto && (
            <img
              src={actualPhoto}
              alt="Sent photo"
              className="rounded-[14px] w-[230px] max-w-full h-[150px] object-cover mb-[6px] block"
              style={{ backgroundColor: 'var(--surface-1)' }}
            />
          )}

          {/* Voice type */}
          {resolvedType === 'voice' && <div className="my-[2px]">{renderVoiceNote()}</div>}

          {/* Text Content */}
          {resolvedType !== 'voice' && actualContent && (
            <div style={{ fontSize: '16px', lineHeight: 1.45 }}>{actualContent}</div>
          )}
        </div>

        {/* Reaction & Timestamp placed UNDER the bubble, never overlapping */}
        <div className="flex items-center justify-end gap-[6px] mt-[4px] px-[2px]">
          {renderReaction()}
          <span
            className="tnum select-none"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--muted)',
            }}
          >
            {actualTime}
          </span>
          {renderTicks()}
        </div>
      </motion.div>
    );
  }

  // RECEIVED MESSAGE:
  // NO BUBBLE — plain text on paper background (var(--bg)), the signature of the design.
  return (
    <div
      className={`flex flex-col items-start self-start max-w-[82%] relative ${topMarginClass} ${className}`}
    >
      {renderReplyQuote()}

      {/* Photo type */}
      {resolvedType === 'photo' && actualPhoto && (
        <img
          src={actualPhoto}
          alt="Received photo"
          className="rounded-[14px] w-[230px] max-w-full h-[150px] object-cover mb-[6px] block"
          style={{ backgroundColor: 'var(--surface-1)' }}
        />
      )}

      {/* Voice type */}
      {resolvedType === 'voice' && renderVoiceNote()}

      {/* Plain text message on paper background */}
      {resolvedType !== 'voice' && actualContent && (
        <div
          className="select-text"
          style={{
            fontSize: '16px',
            lineHeight: 1.45,
            color: 'var(--ink)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {actualContent}
        </div>
      )}

      {/* Timestamp & Reaction below the message */}
      <div className="flex items-center gap-[6px] mt-[4px]">
        <span
          className="tnum select-none"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--muted)',
          }}
        >
          {actualTime}
        </span>
        {renderReaction()}
      </div>
    </div>
  );
}

export default MessageBubble;
