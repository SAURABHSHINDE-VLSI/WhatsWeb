import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Lock, ShieldCheck, Check, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useChat } from '../contexts/ChatContext';

export function SecurityDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerId = id || '';

  const { activeChat, getSafetyNumber, verifySafetyNumber } = useChat();
  const [safetyNumber, setSafetyNumber] = useState<string>('Loading safety number...');
  const [isVerified, setIsVerified] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let mounted = true;
    if (partnerId) {
      getSafetyNumber(partnerId).then((num) => {
        if (mounted) setSafetyNumber(num);
      });
    }
    return () => {
      mounted = false;
    };
  }, [partnerId, getSafetyNumber]);

  useEffect(() => {
    if (safetyNumber && !safetyNumber.includes('Loading') && qrCanvasRef.current) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        `whatsus:safety:${partnerId}:${safetyNumber.replace(/\s+/g, '')}`,
        {
          width: 180,
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
  }, [safetyNumber, partnerId, showQR]);

  const handleVerify = async () => {
    await verifySafetyNumber(partnerId, safetyNumber);
    setIsVerified(true);
  };

  const partnerName = activeChat?.name || activeChat?.username || 'Contact';
  const groups = safetyNumber.split(' ');

  return (
    <div
      className="flex flex-col min-h-dvh select-none pb-safe"
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
          Security &amp; Safety Number
        </span>
      </header>

      <main className="flex-1 px-5 py-6 flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* Verification Status Card */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3 shadow-inner"
            style={{
              backgroundColor: isVerified ? 'var(--accent)' : 'var(--surface-1)',
              color: isVerified ? 'var(--accent-ink)' : 'var(--accent)',
            }}
          >
            <ShieldCheck size={32} strokeWidth={1.75} />
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '22px',
              fontWeight: 500,
              lineHeight: 1.2,
              color: 'var(--ink)',
            }}
          >
            End-to-End Encrypted
          </h1>

          <p
            className="mt-1.5 text-xs max-w-xs"
            style={{ color: 'var(--muted)', lineHeight: 1.45 }}
          >
            Messages and calls with <span className="font-semibold text-[var(--ink)]">{partnerName}</span> are secured with Signal-standard X3DH and Double Ratchet.
          </p>
        </div>

        {/* Safety Number Display & QR */}
        <div
          className="p-5 rounded-2xl flex flex-col items-center gap-4 border shadow-sm"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
          }}
        >
          <div className="text-center">
            <span
              className="text-xs uppercase tracking-wider font-semibold"
              style={{ color: 'var(--muted)' }}
            >
              Verify Safety Number
            </span>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Scan the QR code or compare the 60 numeric digits on {partnerName}’s device.
            </p>
          </div>

          {/* QR Code Canvas */}
          <div className="p-3 bg-[var(--surface-2)] rounded-xl">
            <canvas ref={qrCanvasRef} className="rounded-lg" />
          </div>

          {/* 12 Groups of 5 Digits */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-center tnum">
            {groups.map((grp, idx) => (
              <span
                key={idx}
                className="text-xs font-mono tracking-wider font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {grp}
              </span>
            ))}
          </div>

          {/* Verify Button */}
          <button
            type="button"
            onClick={handleVerify}
            disabled={isVerified}
            className="w-full py-2.5 rounded-xl font-medium cursor-pointer transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
            style={{
              backgroundColor: isVerified ? 'var(--surface-2)' : 'var(--accent)',
              color: isVerified ? 'var(--accent)' : 'var(--accent-ink)',
              border: isVerified ? '1px solid var(--accent)' : 'none',
              fontSize: '14px',
            }}
          >
            {isVerified ? (
              <>
                <Check size={16} />
                <span>Safety Number Verified</span>
              </>
            ) : (
              <span>Mark as Verified</span>
            )}
          </button>
        </div>

        {/* Technical Cryptographic Specs */}
        <div
          className="p-4 rounded-xl text-xs space-y-2.5 border"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
            color: 'var(--muted)',
          }}
        >
          <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--ink)' }}>
            <Lock size={13} style={{ color: 'var(--accent)' }} />
            <span>Cryptographic Architecture (Signal Protocol)</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Protocol</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>Signal X3DH + Double Ratchet</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Authenticated Cipher</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>XChaCha20-Poly1305 (24-byte Nonce)</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Media Encryption</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>crypto_secretstream (Chunk-Safe)</span>
          </div>
          <div className="flex justify-between">
            <span>Key Storage At Rest</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>WebCrypto Wrapped (Non-extractable)</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default SecurityDetailsPage;
