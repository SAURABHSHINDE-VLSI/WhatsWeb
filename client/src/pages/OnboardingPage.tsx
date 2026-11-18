import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Feather, AtSign, User as UserIcon, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const RESERVED_NAMES = [
  'admin', 'administrator', 'support', 'help', 'whatsus', 'whatsweb',
  'official', 'root', 'security', 'moderator', 'system', 'api', 'bot',
  'everyone', 'null', 'undefined',
];

const AVATAR_TINTS = [
  { id: 0, name: 'Warm Ochre', bg: 'var(--tint-1, #D9CDB8)' },
  { id: 1, name: 'Sage Green', bg: 'var(--tint-2, #C8D1C5)' },
  { id: 2, name: 'Terracotta', bg: 'var(--tint-3, #D6CBC2)' },
  { id: 3, name: 'Slate Dusk', bg: 'var(--tint-4, #CDC8D1)' },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarTint, setAvatarTint] = useState(user?.avatarTint || 0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is already onboarded, redirect to chats
  useEffect(() => {
    if (user?.isOnboarded) {
      navigate('/');
    }
  }, [user, navigate]);

  const validateUsername = (val: string): string | null => {
    const clean = val.trim().toLowerCase();
    if (!clean) return 'Username is required';
    if (clean.length < 3) return 'Username must be at least 3 characters';
    if (clean.length > 20) return 'Username cannot exceed 20 characters';
    if (!/^[a-z0-9_]+$/.test(clean)) return 'Only lowercase letters, numbers, and underscores allowed';
    if (clean.startsWith('_') || clean.endsWith('_')) return 'Username cannot begin or end with an underscore';
    if (RESERVED_NAMES.includes(clean)) return 'This username is reserved';
    return null;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(val);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!displayName.trim()) {
      setError('Please provide a display name');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await completeOnboarding(username.trim().toLowerCase(), displayName.trim(), avatarTint);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to complete profile');
    } finally {
      setIsSubmitting(false);
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
      <div className="flex flex-col items-center text-center mt-6">
        <div
          className="flex items-center justify-center mb-4 shadow-sm"
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
          Choose Your Identity
        </h1>

        <p
          className="mt-1.5 max-w-xs"
          style={{
            fontSize: 'var(--text-secondary)',
            color: 'var(--muted)',
            lineHeight: 1.4,
          }}
        >
          Your unique <span className="font-semibold text-[var(--ink)]">@username</span> is how contacts find and correspond with you securely.
        </p>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto flex flex-col gap-5 my-6">
        {error && (
          <div
            className="flex items-start gap-2.5 p-3 rounded-xl text-xs"
            style={{
              backgroundColor: 'rgba(180, 69, 47, 0.1)',
              color: 'var(--heart)',
              border: '1px solid rgba(180, 69, 47, 0.2)',
            }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Username Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
            Unique Handle
          </label>
          <div
            className="flex items-center gap-2 px-3.5 py-3 rounded-xl transition-all"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <AtSign size={18} style={{ color: 'var(--accent)' }} />
            <input
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="username"
              maxLength={20}
              required
              autoFocus
              className="bg-transparent flex-1 outline-none text-sm font-mono tracking-tight"
              style={{ color: 'var(--ink)' }}
            />
            {username && !validateUsername(username) && (
              <Check size={18} style={{ color: 'var(--accent)' }} />
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            3-20 lowercase letters, numbers, or underscores. Cannot be changed more than once per 30 days.
          </span>
        </div>

        {/* Display Name Field */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
            Display Name
          </label>
          <div
            className="flex items-center gap-2 px-3.5 py-3 rounded-xl"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <UserIcon size={18} style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Suddha or Alex"
              maxLength={50}
              required
              className="bg-transparent flex-1 outline-none text-sm"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        </div>

        {/* Avatar Tint Picker */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
            Avatar Accent Tone
          </label>
          <div className="flex items-center justify-between gap-3 pt-1">
            {AVATAR_TINTS.map((tint) => (
              <button
                key={tint.id}
                type="button"
                onClick={() => setAvatarTint(tint.id)}
                className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl border transition-all cursor-pointer"
                style={{
                  backgroundColor: avatarTint === tint.id ? 'var(--surface-2)' : 'var(--surface-1)',
                  borderColor: avatarTint === tint.id ? 'var(--accent)' : 'transparent',
                }}
              >
                <div
                  className="w-8 h-8 rounded-full shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: tint.bg }}
                >
                  {avatarTint === tint.id && <Check size={14} style={{ color: '#1D1B18' }} />}
                </div>
                <span className="text-[10px] font-medium" style={{ color: 'var(--ink)' }}>
                  {tint.name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={isSubmitting || Boolean(validateUsername(username)) || !displayName.trim()}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl transition-opacity font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: '15px',
          }}
        >
          <span>{isSubmitting ? 'Securing Handle...' : 'Complete Profile'}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      {/* Footer Info */}
      <div className="text-center text-xs" style={{ color: 'var(--muted)' }}>
        Zero phone number tracking. Identity linked securely to Google sub.
      </div>
    </div>
  );
}

export default OnboardingPage;
