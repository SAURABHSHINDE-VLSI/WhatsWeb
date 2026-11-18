import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  MessageSquare,
  Phone,
  Video,
  Shield,
  Image,
  UserX,
  FileText,
} from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useCall } from '../contexts/CallContext';
import { apiLookupUser, apiBlockUser, apiUnblockUser } from '../lib/api';
import { getMessagesForPartner } from '../lib/db';

export function ProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerId = id || '';

  const { chats, isUserOnline } = useChat();
  const { startCall } = useCall();

  const [contactInfo, setContactInfo] = useState<{
    id: string;
    username: string;
    displayName: string;
    tint: number;
    avatarUrl?: string | null;
  } | null>(null);
  const [mediaCount, setMediaCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);

  useEffect(() => {
    if (!partnerId) return;

    // Check if in active chats first
    const chat = chats.find((c) => c.id === partnerId);
    if (chat) {
      setContactInfo({
        id: chat.id,
        username: chat.username,
        displayName: chat.name,
        tint: chat.tint,
        avatarUrl: chat.avatarUrl,
      });
    } else {
      // Look up contact via API
      apiLookupUser(partnerId)
        .then((res) => {
          if (res.user) {
            setContactInfo({
              id: res.user.id,
              username: res.user.username || 'unknown',
              displayName: res.user.displayName || res.user.username || 'Contact',
              tint: res.user.avatarTint || 0,
              avatarUrl: res.user.avatarUrl,
            });
          }
        })
        .catch(() => {});
    }

    // Count shared media from IndexedDB
    getMessagesForPartner(partnerId)
      .then((msgs) => {
        const count = msgs.filter((m) => m.type === 'photo' || m.type === 'voice').length;
        setMediaCount(count);
      })
      .catch(() => {});
  }, [partnerId, chats]);

  const handleToggleBlock = async () => {
    if (!contactInfo || isUpdatingBlock) return;
    setIsUpdatingBlock(true);
    try {
      if (isBlocked) {
        await apiUnblockUser(contactInfo.id);
        setIsBlocked(false);
      } else {
        if (window.confirm(`Block @${contactInfo.username}? They will no longer be able to message or call you.`)) {
          await apiBlockUser(contactInfo.id);
          setIsBlocked(true);
        }
      }
    } catch (err) {
      console.error('Failed to update block state', err);
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  const displayName = contactInfo?.displayName || 'Contact';
  const username = contactInfo?.username || 'user';
  const tint = contactInfo?.tint || 0;
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isOnline = isUserOnline(partnerId);

  return (
    <div
      className="flex flex-col min-h-full pb-safe"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top Header */}
      <header
        className="flex items-center px-3 h-[54px] shrink-0 pt-safe"
        style={{
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="p-1 -ml-1 cursor-pointer transition-opacity hover:opacity-75"
          style={{ color: 'var(--ink)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <span
          className="ml-2 font-medium"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            color: 'var(--ink)',
          }}
        >
          Contact Info
        </span>
      </header>

      {/* Hero Contact Card */}
      <div className="flex flex-col items-center py-6 px-5 text-center">
        <div
          className="flex items-center justify-center shrink-0 mb-3 select-none"
          style={{
            width: '80px',
            height: '80px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: `var(--tint-${(tint % 4) + 1}, #D9CDB8)`,
            color: '#1D1B18',
            fontFamily: 'var(--font-serif)',
            fontSize: '28px',
            fontWeight: 600,
          }}
        >
          {initials}
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-contact-name)',
            fontWeight: 500,
            lineHeight: 1.2,
            color: 'var(--ink)',
          }}
        >
          {displayName}
        </h1>

        <p className="font-mono text-xs mt-1" style={{ color: 'var(--muted)' }}>
          @{username}
        </p>

        <p className="text-xs mt-0.5" style={{ color: isOnline ? 'var(--accent)' : 'var(--muted)' }}>
          {isOnline ? 'Online now' : 'Signal E2EE Active'}
        </p>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-center gap-3 mt-5 w-full max-w-xs">
          <button
            type="button"
            onClick={() => navigate(`/chat/${partnerId}`)}
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer hover:bg-black/5"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--ink)',
            }}
          >
            <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Message</span>
          </button>

          <button
            type="button"
            onClick={() => startCall(partnerId, displayName, tint, 'voice')}
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer hover:bg-black/5"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--ink)',
            }}
          >
            <Phone size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Audio</span>
          </button>

          <button
            type="button"
            onClick={() => startCall(partnerId, displayName, tint, 'video')}
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer hover:bg-black/5"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--ink)',
            }}
          >
            <Video size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Video</span>
          </button>
        </div>
      </div>

      {/* Info Groups */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          onClick={() => navigate(`/security/${partnerId}`)}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-black/5 transition-colors border-b"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--ink)' }}>Encryption &amp; Safety Number</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Verify cryptographic identity &amp; scan QR
              </div>
            </div>
          </div>
          <FileText size={16} style={{ color: 'var(--muted)' }} />
        </div>

        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Image size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Shared Media</span>
          </div>
          <span className="tnum text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {mediaCount} items
          </span>
        </div>
      </div>

      {/* Block Contact Option */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          onClick={handleToggleBlock}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-red-500/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UserX size={18} style={{ color: 'var(--heart)' }} />
            <span style={{ fontSize: '15px', color: 'var(--heart)' }}>
              {isBlocked ? 'Unblock Contact' : 'Block Contact'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
