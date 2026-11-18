import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit3 } from 'lucide-react';
import {
  SecurityNote,
  SearchBar,
  ChatListItem,
  BottomNav,
} from '../components';

export interface ChatItemData {
  id: string;
  name: string;
  initials: string;
  snippet: string;
  time: string;
  tint: number;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isGroup?: boolean;
  hasVoice?: boolean;
  hasPhoto?: boolean;
}

const CHAT_DATA: ChatItemData[] = [
  {
    id: '1',
    name: 'Maya Lin',
    initials: 'ML',
    snippet: 'The book arrived this morning! Reading chapter 3 tonight.',
    time: '10:42 AM',
    tint: 0,
    unreadCount: 1,
    isPinned: true,
  },
  {
    id: '2',
    name: 'Julian Vance',
    initials: 'JV',
    snippet: 'Voice message (0:42)',
    time: '9:18 AM',
    tint: 1,
    unreadCount: 2,
    hasVoice: true,
  },
  {
    id: '3',
    name: 'Sunday Dinner',
    initials: 'SD',
    snippet: 'Claire: Can everyone bring a side dish or dessert?',
    time: 'Yesterday',
    tint: 2,
    isGroup: true,
  },
  {
    id: '4',
    name: 'Amara Rao',
    initials: 'AR',
    snippet: 'Photo',
    time: 'Yesterday',
    tint: 3,
    hasPhoto: true,
  },
  {
    id: '5',
    name: 'Building Notice Board',
    initials: 'BH',
    snippet: 'Elevator inspection scheduled for Thursday 9 AM.',
    time: 'Mon',
    tint: 0,
    isMuted: true,
  },
  {
    id: '6',
    name: 'Dr. Elizabeth Montgomery-Smith',
    initials: 'EM',
    snippet: 'Thank you for confirming the lab appointment.',
    time: 'Oct 28',
    tint: 1,
  },
  {
    id: '7',
    name: 'Theo Harris',
    initials: 'TH',
    snippet: 'Let me know when you land in Zurich.',
    time: 'Oct 24',
    tint: 2,
  },
  {
    id: '8',
    name: 'Sophie Laurent',
    initials: 'SL',
    snippet: 'Shared an article: Architecture of Quiet',
    time: 'Oct 19',
    tint: 3,
  },
  {
    id: '9',
    name: 'Lucas Chen',
    initials: 'LC',
    snippet: 'The coffee tasting starts at ten tomorrow.',
    time: 'Oct 12',
    tint: 0,
  },
];

export function ChatListScreen() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = CHAT_DATA.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.name.toLowerCase().includes(query) ||
      chat.snippet.toLowerCase().includes(query)
    );
  });

  return (
    <div
      className="flex flex-col h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Scrollable Main Column */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col">
        {/* Chats Top Header */}
        <header
          className="flex items-center justify-between shrink-0"
          style={{
            paddingTop: '16px',
            paddingBottom: '8px',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '32px',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              lineHeight: 1.15,
            }}
          >
            Chats
          </h1>

          <button
            type="button"
            aria-label="New chat or compose"
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
            <Edit3 size={19} strokeWidth={1.75} />
          </button>
        </header>

        {/* Security Note Banner */}
        <div
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: '12px',
          }}
        >
          <SecurityNote />
        </div>

        {/* Search Bar */}
        <div
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: '16px',
          }}
        >
          <SearchBar
            value={searchQuery}
            onChange={(val: any) => {
              if (typeof val === 'string') {
                setSearchQuery(val);
              } else if (val && val.target) {
                setSearchQuery(val.target.value);
              }
            }}
            placeholder="Search"
          />
        </div>

        {/* Chat List Items Stream */}
        <div
          className="flex flex-col flex-1"
          style={{
            paddingBottom: '80px', // Clearance for sticky bottom nav
          }}
          role="list"
          aria-label="Chat conversations"
        >
          {filteredChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              id={chat.id}
              name={chat.name}
              initials={chat.initials}
              snippet={chat.snippet}
              time={chat.time}
              tint={chat.tint}
              unreadCount={chat.unreadCount}
              unread={chat.unreadCount}
              isPinned={chat.isPinned}
              pinned={chat.isPinned}
              isMuted={chat.isMuted}
              muted={chat.isMuted}
              isGroup={chat.isGroup}
              group={chat.isGroup}
              hasVoice={chat.hasVoice}
              voiceNote={chat.hasVoice ? chat.snippet : undefined}
              hasPhoto={chat.hasPhoto}
              photo={chat.hasPhoto ? chat.snippet : undefined}
              onClick={() => navigate(`/chat/${chat.id}`)}
            />
          ))}
        </div>
      </div>

      {/* Fixed Bottom Navigation Bar */}
      <BottomNav active="chats" activeTab="chats" />
    </div>
  );
}

export default ChatListScreen;
