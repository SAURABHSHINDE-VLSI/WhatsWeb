import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Share2, ShieldCheck, ChevronRight, Bell, Ban } from 'lucide-react';
import { Avatar, SettingsRow } from '../components';

const SHARED_PHOTOS = [
  {
    id: 'p1',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=300&q=80',
    alt: 'Courtyard architecture',
  },
  {
    id: 'p2',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=300&q=80',
    alt: 'Minimalist skyscraper building',
  },
  {
    id: 'p3',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=300&q=80',
    alt: 'Serene interior workspace',
  },
];

export function ProfileScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isMuted, setIsMuted] = useState(false);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Maya Lin',
        text: 'Contact: Maya Lin (+1 555 492-3810)',
      }).catch(() => {
        // Ignored or cancelled
      });
    }
  };

  return (
    <div
      className="flex flex-col min-h-dvh w-full overflow-y-auto select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
        paddingBottom: '32px',
      }}
    >
      {/* Top Header */}
      <header
        className="w-full shrink-0 flex items-center justify-between sticky top-0 z-30"
        style={{
          height: '56px',
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingLeft: '12px',
          paddingRight: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-75"
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

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          Contact
        </h1>

        <button
          type="button"
          onClick={handleShare}
          aria-label="Share contact"
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
          <Share2 size={19} strokeWidth={1.75} />
        </button>
      </header>

      {/* Hero Contact Section */}
      <section
        className="flex flex-col items-center text-center"
        style={{
          paddingTop: '24px',
          paddingBottom: '24px',
          paddingLeft: '24px',
          paddingRight: '24px',
        }}
      >
        <div className="flex items-center justify-center mb-3">
          <Avatar size={84} initials="ML" tint={0} name="Maya Lin" />
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '27px',
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.2,
            letterSpacing: '-0.01em',
          }}
        >
          Maya Lin
        </h2>

        <p
          className="tnum mt-1"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--muted)',
            lineHeight: 1.4,
          }}
        >
          +1 (555) 492-3810
        </p>
      </section>

      {/* Hairline Divider */}
      <hr
        style={{
          border: 'none',
          height: '1px',
          backgroundColor: 'var(--line)',
          margin: 0,
        }}
      />

      {/* Verify Security Section */}
      <section
        style={{
          borderBottom: '1px solid var(--line)',
        }}
      >
        <SettingsRow
          icon={<ShieldCheck size={20} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />}
          title="Verify security"
          subtitle="Compare safety number & QR code"
          chevron={true}
          rightElement={<ChevronRight size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
          onClick={() => {}}
        />
      </section>

      {/* Hairline Divider */}
      <hr
        style={{
          border: 'none',
          height: '1px',
          backgroundColor: 'var(--line)',
          margin: 0,
        }}
      />

      {/* Shared Media Section */}
      <section
        style={{
          paddingTop: '20px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: '12px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 600,
            }}
          >
            SHARED MEDIA
          </span>
        </div>

        {/* 3-column Photo Grid */}
        <div
          className="grid grid-cols-3"
          style={{
            gap: '4px',
            paddingLeft: '24px',
            paddingRight: '24px',
          }}
        >
          {SHARED_PHOTOS.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden"
              style={{
                borderRadius: '4px',
                backgroundColor: 'var(--surface-1)',
              }}
            >
              <img
                src={photo.url}
                alt={photo.alt}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-200 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Details Section */}
      <section
        style={{
          paddingTop: '20px',
        }}
      >
        <div
          style={{
            paddingLeft: '24px',
            paddingRight: '24px',
            paddingBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 600,
            }}
          >
            DETAILS
          </span>
        </div>

        {/* Mute Notifications Row */}
        <SettingsRow
          icon={<Bell size={18} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />}
          title="Mute notifications"
          rightElement={
            <button
              type="button"
              role="switch"
              aria-checked={isMuted}
              aria-label="Mute notifications"
              onClick={() => setIsMuted((prev) => !prev)}
              className="relative inline-flex items-center cursor-pointer transition-colors"
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '9999px',
                backgroundColor: isMuted ? 'var(--accent)' : 'var(--line)',
                border: 'none',
                padding: '2px',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  transform: isMuted ? 'translateX(20px)' : 'translateX(0px)',
                  transition: 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1.0)',
                }}
              />
            </button>
          }
        />

        {/* Hairline Between Details Items */}
        <div style={{ height: '1px', backgroundColor: 'var(--line)', marginLeft: '24px' }} />

        {/* Block Maya Lin Row */}
        <button
          type="button"
          onClick={() => {}}
          className="w-full flex items-center justify-between text-left cursor-pointer transition-colors hover:opacity-85"
          style={{
            paddingTop: '16px',
            paddingBottom: '16px',
            paddingLeft: '24px',
            paddingRight: '24px',
            minHeight: '48px',
            background: 'transparent',
            border: 'none',
            color: 'var(--heart)',
          }}
        >
          <div className="flex items-center gap-3">
            <Ban size={18} strokeWidth={1.75} style={{ color: 'var(--heart)' }} />
            <span
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: 'var(--heart)',
              }}
            >
              Block Maya Lin
            </span>
          </div>
        </button>
      </section>
    </div>
  );
}

export default ProfileScreen;
