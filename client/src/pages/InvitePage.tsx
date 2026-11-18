import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Feather, ArrowRight, UserPlus, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiGetInvite, apiSendContactRequest, User } from '../lib/api';

export function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [inviter, setInviter] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('Missing invite code');
      setIsLoading(false);
      return;
    }

    apiGetInvite(code)
      .then((res) => {
        setInviter(res.user);
      })
      .catch((err) => {
        setError(err.message || 'This invite link is invalid or has expired.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [code]);

  const handleConnect = async () => {
    if (!inviter) return;

    if (!currentUser) {
      // Store pending invite code in sessionStorage
      sessionStorage.setItem('pending_invite_code', code || '');
      navigate('/login');
      return;
    }

    if (currentUser.id === inviter.id) {
      navigate('/');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await apiSendContactRequest(inviter.id);
      navigate(`/chat/${inviter.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div
      className="flex flex-col justify-between min-h-dvh px-6 py-10 pt-safe pb-safe select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mt-8">
        <div
          className="flex items-center justify-center mb-6 shadow-sm"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            backgroundColor: 'var(--surface-1)',
            color: 'var(--accent)',
          }}
        >
          <Feather size={32} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-title)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          Personal Invite
        </h1>

        <p
          className="mt-1 text-xs max-w-xs"
          style={{ color: 'var(--muted)', lineHeight: 1.5 }}
        >
          You were invited to a quiet, end-to-end encrypted correspondence.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-sm mx-auto my-auto flex flex-col gap-4">
        {error ? (
          <div
            className="flex items-start gap-2.5 p-4 rounded-xl text-xs"
            style={{
              backgroundColor: 'rgba(180, 69, 47, 0.1)',
              color: 'var(--heart)',
              border: '1px solid rgba(180, 69, 47, 0.2)',
            }}
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Unable to accept invite</p>
              <p className="mt-1 opacity-90">{error}</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-xs" style={{ color: 'var(--muted)' }}>
            Verifying invitation...
          </div>
        ) : inviter ? (
          <div
            className="p-6 rounded-2xl flex flex-col items-center text-center gap-4 shadow-sm"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center font-serif font-bold text-xl shadow-inner"
              style={{
                backgroundColor: `var(--tint-${(inviter.avatarTint % 4) + 1}, #D9CDB8)`,
                color: '#1D1B18',
              }}
            >
              {(inviter.displayName || inviter.username || '?')[0].toUpperCase()}
            </div>

            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '20px',
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                {inviter.displayName || inviter.username}
              </h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                @{inviter.username}
              </p>
            </div>

            <button
              type="button"
              disabled={isConnecting}
              onClick={handleConnect}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-semibold transition-opacity cursor-pointer mt-2"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-ink)',
              }}
            >
              <UserPlus size={16} />
              <span>{isConnecting ? 'Connecting...' : 'Accept & Start Chat'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-center" style={{ color: 'var(--muted)' }}>
        <ShieldCheck size={14} style={{ color: 'var(--accent)' }} />
        <span>End-to-End Encrypted Messenger</span>
      </div>
    </div>
  );
}

export default InvitePage;
