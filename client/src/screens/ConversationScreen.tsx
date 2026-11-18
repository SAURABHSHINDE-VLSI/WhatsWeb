import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Phone } from 'lucide-react';
import {
  Avatar,
  DayDivider,
  MessageBubble,
  Composer,
} from '../components';

export interface ChatMessage {
  id: string;
  sender: 'them' | 'me';
  type: 'received' | 'sent';
  isSent: boolean;
  text?: string;
  time: string;
  status?: 'read' | 'delivered' | 'sent';
  isRead?: boolean;
  photo?: string;
  imageUrl?: string;
  media?: string;
  replyQuote?: { author: string; text: string };
  quote?: string;
  replyTo?: string;
  reaction?: { emoji: string; count: number };
  reactions?: Array<{ emoji: string; count: number }>;
  hasVoice?: boolean;
  isVoice?: boolean;
  voiceDuration?: string;
  duration?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    sender: 'them',
    type: 'received',
    isSent: false,
    text: 'Did the architecture monograph arrive yet?',
    time: '10:38 AM',
  },
  {
    id: 'm2',
    sender: 'me',
    type: 'sent',
    isSent: true,
    text: 'Yes, it just came in. The print quality is incredible.',
    time: '10:39 AM',
    status: 'read',
    isRead: true,
  },
  {
    id: 'm3',
    sender: 'them',
    type: 'received',
    isSent: false,
    photo: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80',
    imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80',
    media: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80',
    text: 'Look at this courtyard layout from page 42.',
    time: '10:40 AM',
  },
  {
    id: 'm4',
    sender: 'me',
    type: 'sent',
    isSent: true,
    text: 'That timber framing is stunning.',
    time: '10:41 AM',
    status: 'read',
    isRead: true,
    replyQuote: {
      author: 'Maya',
      text: 'Look at this courtyard layout...',
    },
    quote: 'Look at this courtyard layout...',
    replyTo: 'Look at this courtyard layout from page 42.',
    reaction: { emoji: '❤️', count: 1 },
    reactions: [{ emoji: '❤️', count: 1 }],
  },
  {
    id: 'm5',
    sender: 'them',
    type: 'received',
    isSent: false,
    hasVoice: true,
    isVoice: true,
    voiceDuration: '0:42',
    duration: '0:42',
    time: '10:42 AM',
  },
];

export function ConversationScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);

  const handleSendMessage = (content: string) => {
    if (!content || !content.trim()) return;

    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'me',
      type: 'sent',
      isSent: true,
      text: content.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent',
      isRead: false,
    };

    setMessages((prev) => [...prev, newMsg]);
  };

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top Header */}
      <header
        className="w-full shrink-0 z-30 flex items-center justify-between"
        style={{
          height: '56px',
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingLeft: '12px',
          paddingRight: '16px',
        }}
      >
        <div className="flex items-center gap-2">
          {/* Back Chevron */}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to chats"
            className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-75 -ml-1"
            style={{
              color: 'var(--ink)',
              minWidth: '44px',
              minHeight: '44px',
              border: 'none',
              background: 'transparent',
              padding: '8px',
            }}
          >
            <ChevronLeft size={24} strokeWidth={1.75} />
          </button>

          {/* Contact Details Trigger */}
          <button
            type="button"
            onClick={() => navigate(`/profile/${id || '1'}`)}
            className="flex items-center gap-3 text-left cursor-pointer transition-opacity hover:opacity-85"
            style={{
              border: 'none',
              background: 'transparent',
              padding: '4px',
              minHeight: '44px',
            }}
          >
            <Avatar size={36} initials="ML" tint={0} name="Maya Lin" />

            <div className="flex flex-col">
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '18px',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: 'var(--ink)',
                  lineHeight: 1.2,
                }}
              >
                Maya Lin
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11.5px',
                  color: 'var(--muted)',
                  marginTop: '1px',
                }}
              >
                Active now · End-to-end encrypted
              </span>
            </div>
          </button>
        </div>

        {/* Call Action Button */}
        <button
          type="button"
          aria-label="Call Maya Lin"
          className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-75"
          style={{
            color: 'var(--muted)',
            minWidth: '44px',
            minHeight: '44px',
            border: 'none',
            background: 'transparent',
            padding: '8px',
          }}
        >
          <Phone size={19} strokeWidth={1.75} />
        </button>
      </header>

      {/* Message Stream Area with Warm Dark Radial Atmosphere */}
      <main
        className="flex-1 overflow-y-auto no-scrollbar flex flex-col relative"
        style={{
          backgroundColor: 'var(--bg)',
          backgroundImage:
            'var(--warm-tint-overlay, radial-gradient(ellipse at 50% 0%, rgba(229,115,90,0.035) 0%, transparent 60%))',
          paddingTop: '16px',
          paddingBottom: '20px',
          paddingLeft: '20px',
          paddingRight: '20px',
        }}
      >
        {/* Day Divider */}
        <div className="self-center my-2">
          <DayDivider text="TODAY" />
        </div>

        {/* Message Bubbles Stream */}
        <div className="flex flex-col gap-4 mt-2">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              id={msg.id}
              sender={msg.sender}
              type={msg.type}
              isSent={msg.isSent}
              text={msg.text}
              time={msg.time}
              status={msg.status}
              isRead={msg.isRead}
              photo={msg.photo}
              imageUrl={msg.imageUrl}
              media={msg.media}
              replyQuote={msg.replyQuote}
              quote={msg.quote}
              replyTo={msg.replyTo}
              reaction={msg.reaction}
              reactions={msg.reactions}
              hasVoice={msg.hasVoice}
              isVoice={msg.isVoice}
              voiceDuration={msg.voiceDuration}
              duration={msg.duration}
            />
          ))}
        </div>
      </main>

      {/* Message Composer Area */}
      <footer className="w-full shrink-0 z-30">
        <Composer
          placeholder="Message..."
          onSend={(text: string) => handleSendMessage(text)}
        />
      </footer>
    </div>
  );
}

export default ConversationScreen;
