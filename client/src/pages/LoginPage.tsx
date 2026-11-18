import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Feather, Shield, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiGetHealth, apiGetAuthNonce } from '../lib/api';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement | null, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const { user, googleSignIn } = useAuth();
  const [clientId, setClientId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(true);
  const buttonRef = useRef<HTMLDivElement>(null);

  // If already logged in and onboarded, navigate to home
  useEffect(() => {
    if (user) {
      if (user.isOnboarded) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, navigate]);

  // Fetch server configuration & cryptographic nonce
  const fetchConfigAndNonce = useCallback(async () => {
    setIsConfiguring(true);
    setError(null);
    try {
      const [health, nonceRes] = await Promise.all([
        apiGetHealth(),
        apiGetAuthNonce(),
      ]);

      const cid = health.googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || null;
      setClientId(cid);
      setNonce(nonceRes.nonce);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to authentication server');
    } finally {
      setIsConfiguring(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigAndNonce();
  }, [fetchConfigAndNonce]);

  // Handle Google ID Token Callback
  const handleCredentialResponse = useCallback(
    async (response: { credential?: string }) => {
      if (!response.credential || !nonce) {
        setError('Missing Google authentication response');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { isOnboarded } = await googleSignIn(response.credential, nonce);
        if (isOnboarded) {
          navigate('/');
        } else {
          navigate('/onboarding');
        }
      } catch (err: any) {
        setError(err.message || 'Google sign-in failed. Please try again.');
        // Refresh nonce after failed attempt
        fetchConfigAndNonce();
      } finally {
        setIsLoading(false);
      }
    },
    [googleSignIn, navigate, nonce, fetchConfigAndNonce]
  );

  // Initialize and render Google Identity Services button
  useEffect(() => {
    if (!clientId || !nonce || !buttonRef.current) return;

    const scriptId = 'google-gsi-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      if (window.google?.accounts?.id && buttonRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce,
          callback: handleCredentialResponse,
          auto_select: false,
          itp_support: true,
        });

        // Clear existing children before rendering
        buttonRef.current.innerHTML = '';

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 280,
        });

        clearInterval(interval);
      }
    }, 200);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [clientId, nonce, handleCredentialResponse]);

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
      <div className="flex flex-col items-center text-center mt-12">
        <div
          className="flex items-center justify-center mb-6 shadow-sm"
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '24px',
            backgroundColor: 'var(--surface-1)',
            color: 'var(--accent)',
          }}
        >
          <Feather size={36} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-title)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            color: 'var(--ink)',
          }}
        >
          WhatsUS
        </h1>

        <p
          className="mt-2 max-w-xs"
          style={{
            fontSize: 'var(--text-message)',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          Private, end-to-end encrypted correspondence. No passwords. No phone numbers.
        </p>
      </div>

      {/* Auth Card Area */}
      <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-4 my-auto">
        {error && (
          <div
            className="w-full flex items-start gap-2.5 p-3.5 rounded-xl text-sm"
            style={{
              backgroundColor: 'rgba(180, 69, 47, 0.1)',
              color: 'var(--heart)',
              border: '1px solid rgba(180, 69, 47, 0.2)',
            }}
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1 text-xs leading-relaxed">{error}</span>
          </div>
        )}

        {isConfiguring ? (
          <div className="py-6 text-sm" style={{ color: 'var(--muted)' }}>
            Connecting to secure identity server...
          </div>
        ) : clientId ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div
              ref={buttonRef}
              className="min-h-[44px] flex items-center justify-center transition-opacity"
              style={{ opacity: isLoading ? 0.5 : 1 }}
            />
            {isLoading && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Verifying cryptographic token...
              </span>
            )}
          </div>
        ) : (
          <div
            className="w-full p-4 rounded-xl text-center"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--line)',
            }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Google Sign-In Setup Required
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Set <code className="px-1 py-0.5 rounded bg-black/10">GOOGLE_CLIENT_ID</code> in the server environment to activate sign-in.
            </p>
          </div>
        )}
      </div>

      {/* Security Guarantee Footer */}
      <div className="flex flex-col items-center text-center gap-2 max-w-xs mx-auto">
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
          <Shield size={14} />
          <span>Zero Plaintext Architecture</span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
          Your identity is bound to a unique anonymous token. Your email is never shared with contacts.
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
