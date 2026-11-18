import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AtSign,
  Search,
  Link as LinkIcon,
  QrCode,
  Copy,
  Check,
  UserPlus,
  MessageSquare,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useAuth } from '../contexts/AuthContext';
import {
  apiLookupUser,
  apiCreateInvite,
  apiSendContactRequest,
  User,
} from '../lib/api';

export function ConnectPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'search' | 'invite' | 'qr'>('search');
  const [usernameQuery, setUsernameQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    user: User;
    isContact: boolean;
    hasPendingRequest: boolean;
  } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Invite Link State
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);

  // QR Code canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate Invite Link on demand or on tab switch
  useEffect(() => {
    if ((activeTab === 'invite' || activeTab === 'qr') && !inviteCode && !isCreatingInvite) {
      setIsCreatingInvite(true);
      apiCreateInvite(30)
        .then((res) => {
          setInviteCode(res.code);
          const fullUrl = `${window.location.origin}/invite/${res.code}`;
          setInviteUrl(fullUrl);
        })
        .catch((err) => {
          console.error('Failed to create invite link', err);
        })
        .finally(() => {
          setIsCreatingInvite(false);
        });
    }
  }, [activeTab, inviteCode, isCreatingInvite]);

  // Render QR Code onto canvas
  useEffect(() => {
    if (activeTab === 'qr' && inviteUrl && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        inviteUrl,
        {
          width: 220,
          margin: 1.5,
          color: {
            dark: '#1D1B18',
            light: '#EDE6D8',
          },
        },
        (err) => {
          if (err) console.error('QR code render error', err);
        }
      );
    }
  }, [activeTab, inviteUrl]);

  // Search User by exact username
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = usernameQuery.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return;

    if (clean === currentUser?.username?.toLowerCase()) {
      setSearchError('This is your own handle');
      setSearchResult(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const res = await apiLookupUser(clean);
      setSearchResult(res);
    } catch (err: any) {
      setSearchError(err.message || 'User not found');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    try {
      await apiSendContactRequest(searchResult.user.id);
      setSearchResult({
        ...searchResult,
        hasPendingRequest: true,
      });
    } catch (err: any) {
      setSearchError(err.message || 'Failed to send request');
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex flex-col min-h-dvh select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center gap-3 pt-safe"
        style={{
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-1.5 rounded-full transition-opacity hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--ink)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          New Connection
        </h1>
      </header>

      {/* Tabs */}
      <div
        className="flex items-center px-4 pt-3 pb-1 gap-2"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className="flex-1 pb-2.5 text-xs font-semibold tracking-wide cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          style={{
            color: activeTab === 'search' ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === 'search' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          <Search size={15} />
          <span>Search @handle</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('invite')}
          className="flex-1 pb-2.5 text-xs font-semibold tracking-wide cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          style={{
            color: activeTab === 'invite' ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === 'invite' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          <LinkIcon size={15} />
          <span>Invite Link</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('qr')}
          className="flex-1 pb-2.5 text-xs font-semibold tracking-wide cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          style={{
            color: activeTab === 'qr' ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === 'qr' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          <QrCode size={15} />
          <span>My QR Code</span>
        </button>
      </div>

      {/* Tab 1: Search by Handle */}
      {activeTab === 'search' && (
        <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col gap-5">
          <form onSubmit={handleSearch} className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Lookup Exact Handle
            </label>
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--line)',
              }}
            >
              <AtSign size={18} style={{ color: 'var(--accent)' }} />
              <input
                type="text"
                value={usernameQuery}
                onChange={(e) => setUsernameQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="exact_username"
                className="bg-transparent flex-1 outline-none text-sm font-mono"
                style={{ color: 'var(--ink)' }}
                autoFocus
              />
              <button
                type="submit"
                disabled={isSearching || !usernameQuery.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-ink)',
                }}
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
              WhatsUS strictly prevents user enumeration: only exact handles can be looked up.
            </p>
          </form>

          {searchError && (
            <div
              className="flex items-start gap-2 p-3 rounded-xl text-xs"
              style={{
                backgroundColor: 'rgba(180, 69, 47, 0.1)',
                color: 'var(--heart)',
                border: '1px solid rgba(180, 69, 47, 0.2)',
              }}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{searchError}</span>
            </div>
          )}

          {searchResult && (
            <div
              className="p-4 rounded-xl flex items-center justify-between shadow-sm"
              style={{
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--line)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold text-sm"
                  style={{
                    backgroundColor: `var(--tint-${(searchResult.user.avatarTint % 4) + 1}, #D9CDB8)`,
                    color: '#1D1B18',
                  }}
                >
                  {(searchResult.user.displayName || searchResult.user.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {searchResult.user.displayName || searchResult.user.username}
                  </h3>
                  <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                    @{searchResult.user.username}
                  </p>
                </div>
              </div>

              <div>
                {searchResult.isContact ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/chat/${searchResult.user.id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Open Chat</span>
                  </button>
                ) : searchResult.hasPendingRequest ? (
                  <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      color: 'var(--muted)',
                    }}
                  >
                    <Clock size={13} />
                    <span>Request Sent</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }}
                  >
                    <UserPlus size={14} />
                    <span>Connect</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Personal Invite Link */}
      {activeTab === 'invite' && (
        <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col gap-6">
          <div className="text-center">
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '20px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              Share Your Personal Invite
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
              Anyone with this link can start an end-to-end encrypted correspondence with you directly. You can revoke it at any time.
            </p>
          </div>

          <div
            className="p-4 rounded-xl flex flex-col gap-3"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Invite Link (Valid for 30 days)
            </span>
            <div
              className="flex items-center justify-between p-2.5 rounded-lg font-mono text-xs overflow-hidden"
              style={{
                backgroundColor: 'var(--surface-2)',
                color: 'var(--ink)',
              }}
            >
              <span className="truncate pr-2">{inviteUrl || 'Generating link...'}</span>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!inviteUrl}
                className="shrink-0 p-1.5 rounded-md hover:bg-black/5 cursor-pointer transition-colors"
                style={{ color: 'var(--accent)' }}
                title="Copy link"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!inviteUrl}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-opacity"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Invite Link'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
            <span>Invites bypass public lookup enumeration and keep your handle private.</span>
          </div>
        </div>
      )}

      {/* Tab 3: Personal QR Code */}
      {activeTab === 'qr' && (
        <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '20px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              Scan to Connect
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              Have your friend scan this QR code with their camera to connect instantly.
            </p>
          </div>

          <div
            className="p-5 rounded-2xl shadow-sm flex flex-col items-center justify-center"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <canvas ref={canvasRef} className="rounded-xl" />
            <span className="mt-3 text-xs font-mono font-semibold" style={{ color: 'var(--ink)' }}>
              @{currentUser?.username}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!inviteUrl}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
            }}
          >
            {copied ? <Check size={15} style={{ color: 'var(--accent)' }} /> : <Copy size={15} />}
            <span>{copied ? 'Link Copied' : 'Copy Link Instead'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ConnectPage;
