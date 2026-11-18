import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MessageSquare, Phone, Video, Bell, Shield, Image, FileText } from 'lucide-react';

export function ProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

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
            backgroundColor: 'var(--tint-1)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-serif)',
            fontSize: '28px',
            fontWeight: 500,
          }}
        >
          ML
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
          Maya Lin
        </h1>

        <p className="tnum mt-1" style={{ fontSize: '13px', color: 'var(--muted)' }}>
          +1 (555) 382-9102
        </p>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-center gap-3 mt-5 w-full max-w-xs">
          <button
            type="button"
            onClick={() => navigate(`/chat/${id || '1'}`)}
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer"
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
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer"
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
            className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all cursor-pointer"
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
        <div className="px-5 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
            About
          </div>
          <div style={{ fontSize: '15px', color: 'var(--ink)' }}>
            Architectural designer · Reading monograph notes
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer">
          <div className="flex items-center gap-3">
            <Bell size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Mute notifications</span>
          </div>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>No</span>
        </div>
      </div>

      {/* Shared Media Section */}
      <div
        className="my-2"
        style={{
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <Image size={18} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: '15px', color: 'var(--ink)' }}>Media, links, and docs</span>
          </div>
          <span className="tnum" style={{ fontSize: '13px', color: 'var(--muted)' }}>
            42
          </span>
        </div>

        <div
          onClick={() => navigate(`/security/${id || 'user_maya'}`)}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--ink)' }}>Encryption &amp; Safety Number</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Tap to verify safety number fingerprint
              </div>
            </div>
          </div>
          <FileText size={16} style={{ color: 'var(--muted)' }} />
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
