import { useNavigate } from 'react-router-dom';
import { Lock, Feather, WifiOff, ArrowRight } from 'lucide-react';

export function OnboardingPage() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col justify-between min-h-dvh px-6 py-10 pt-safe pb-safe select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Brand & Introduction */}
      <div className="flex flex-col items-center text-center mt-8">
        <div
          className="flex items-center justify-center mb-6"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-lg)',
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
          A quiet, editorial messenger designed for calm correspondence and focused thought.
        </p>
      </div>

      {/* Feature Pillars */}
      <div className="flex flex-col gap-5 my-8 max-w-sm mx-auto w-full">
        <div className="flex items-start gap-4">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ backgroundColor: 'var(--surface-1)', color: 'var(--accent)' }}
          >
            <Lock size={20} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              End-to-End Encrypted
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
              Your private conversations stay strictly between you and your recipients.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ backgroundColor: 'var(--surface-1)', color: 'var(--accent)' }}
          >
            <Feather size={20} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              Editorial &amp; Calm
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
              Subtle warm surfaces, Fraunces serif typography, and zero notification noise.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div
            className="p-2.5 rounded-xl shrink-0"
            style={{ backgroundColor: 'var(--surface-1)', color: 'var(--accent)' }}
          >
            <WifiOff size={20} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              Offline-First PWA
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
              Full speed and immediate access everywhere, even without cellular connection.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <div className="w-full max-w-sm mx-auto">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 transition-opacity hover:opacity-90 cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderRadius: 'var(--radius-md)',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          <span>Continue</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

export default OnboardingPage;
