import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Slide {
  headline: string;
  body: string;
}

const ONBOARDING_SLIDES: Slide[] = [
  {
    headline: 'A quiet space for conversation.',
    body: 'Only you and the person you message can read what you share.',
  },
  {
    headline: 'Thoughtfully crafted.',
    body: 'No tracking, no algorithms, no clutter. Just pure reading-room calm.',
  },
  {
    headline: 'Install to your device.',
    body: 'Fast, private, and always available from your home screen.',
  },
];

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleContinue = () => {
    if (currentSlide < ONBOARDING_SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      navigate('/');
    }
  };

  const handlePasskeySignIn = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/');
  };

  return (
    <div
      className="flex flex-col justify-between min-h-dvh w-full overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
        paddingTop: '24px',
        paddingBottom: '32px',
        paddingLeft: '24px',
        paddingRight: '24px',
      }}
    >
      {/* Top Header Row with Encryption Badge */}
      <header className="w-full flex items-center justify-between shrink-0" style={{ minHeight: '44px' }}>
        <div
          className="flex items-center gap-2"
          style={{
            fontSize: '12px',
            color: 'var(--muted)',
            fontWeight: 500,
          }}
        >
          <Lock size={14} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
          <span>End-to-end encrypted</span>
        </div>

        {/* Optional Skip control when not on last slide */}
        {currentSlide < ONBOARDING_SLIDES.length - 1 && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="cursor-pointer transition-opacity hover:opacity-70 flex items-center justify-center"
            style={{
              fontSize: '13px',
              color: 'var(--muted)',
              minWidth: '44px',
              minHeight: '44px',
              paddingLeft: '8px',
              paddingRight: '8px',
            }}
          >
            Skip
          </button>
        )}
      </header>

      {/* Main Slide Carousel Area */}
      <main className="flex-1 flex flex-col justify-center items-center my-auto w-full max-w-md mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] }}
            className="flex flex-col items-center text-center w-full"
            style={{
              paddingLeft: '16px',
              paddingRight: '16px',
            }}
          >
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '32px',
                fontWeight: 500,
                lineHeight: 1.22,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                marginBottom: '16px',
              }}
            >
              {ONBOARDING_SLIDES[currentSlide].headline}
            </h1>

            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                lineHeight: 1.55,
                color: 'var(--muted)',
                maxWidth: '320px',
              }}
            >
              {ONBOARDING_SLIDES[currentSlide].body}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Dot Indicators */}
        <div
          className="flex items-center justify-center gap-2 mt-8"
          role="tablist"
          aria-label="Slide indicators"
        >
          {ONBOARDING_SLIDES.map((_, index) => {
            const isActive = index === currentSlide;
            return (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-selected={isActive}
                role="tab"
                style={{
                  height: '6px',
                  width: isActive ? '20px' : '6px',
                  borderRadius: '9999px',
                  backgroundColor: isActive ? 'var(--accent)' : 'var(--surface-2)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
                }}
              />
            );
          })}
        </div>
      </main>

      {/* Bottom Actions Area */}
      <footer className="w-full max-w-md mx-auto flex flex-col items-center gap-3 shrink-0">
        {/* Primary Continue Button */}
        <button
          type="button"
          onClick={handleContinue}
          className="w-full flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.99]"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-ink)',
            borderRadius: '12px',
            minHeight: '48px',
            paddingTop: '12px',
            paddingBottom: '12px',
            paddingLeft: '24px',
            paddingRight: '24px',
            fontSize: '15px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            border: 'none',
          }}
        >
          <span>{currentSlide === ONBOARDING_SLIDES.length - 1 ? 'Get started' : 'Continue'}</span>
          <ArrowRight size={18} strokeWidth={1.75} />
        </button>

        {/* Passkey Sign In Link */}
        <button
          type="button"
          onClick={handlePasskeySignIn}
          className="cursor-pointer transition-colors hover:opacity-80 flex items-center justify-center"
          style={{
            color: 'var(--muted)',
            fontSize: '13px',
            minHeight: '44px',
            paddingLeft: '16px',
            paddingRight: '16px',
            textDecoration: 'underline',
            textUnderlineOffset: '4px',
            background: 'none',
            border: 'none',
          }}
        >
          Sign in with passkey
        </button>
      </footer>
    </div>
  );
}

export default OnboardingScreen;
