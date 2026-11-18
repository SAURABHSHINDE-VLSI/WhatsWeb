import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Lock, ShieldCheck, Check, Eye } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { apiGetAuditLogs } from '../lib/api';

export function SecurityDetailsScreen() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const partnerId = id || 'user_maya';

  const { activeChat, getSafetyNumber, verifySafetyNumber } = useChat();
  const [safetyNumber, setSafetyNumber] = useState<string>('Loading safety number...');
  const [isVerified, setIsVerified] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    getSafetyNumber(partnerId).then((num) => {
      if (mounted) setSafetyNumber(num);
    });
    return () => {
      mounted = false;
    };
  }, [partnerId, getSafetyNumber]);

  const handleVerify = async () => {
    await verifySafetyNumber(partnerId, safetyNumber);
    setIsVerified(true);
  };

  const loadAuditLogs = async () => {
    setShowAuditLogs(true);
    try {
      const res = await apiGetAuditLogs();
      setAuditLogs(res.logs || []);
    } catch (e) {
      console.warn('Audit fetch failed', e);
    }
  };

  const partnerName = activeChat?.name || (partnerId === 'user_maya' || partnerId === '1' ? 'Maya Lin' : 'Contact');
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
          Security Details
        </span>
      </header>

      <main className="flex-1 px-5 py-6 flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* Verification Status Card */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
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
            className="mt-1.5 text-sm max-w-xs"
            style={{ color: 'var(--muted)', lineHeight: 1.45 }}
          >
            Messages and calls with {partnerName} are secured with end-to-end encryption. No one outside of this chat, not even the server, can read them.
          </p>
        </div>

        {/* Safety Number Fingerprint Display */}
        <div
          className="p-5 rounded-2xl flex flex-col items-center gap-4 border"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
          }}
        >
          <div className="text-center">
            <span
              className="text-xs uppercase tracking-wider font-medium"
              style={{ color: 'var(--muted)' }}
            >
              Safety Number
            </span>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Compare with {partnerName}’s device to verify your connection
            </p>
          </div>

          {/* 12 Groups of 5 Digits (Signal Standard) */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-center tnum">
            {groups.map((grp, idx) => (
              <span
                key={idx}
                className="text-sm font-mono tracking-wider font-semibold"
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
            <span>Cryptographic Architecture</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Cipher</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>XChaCha20-Poly1305 (AEAD)</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Key Agreement</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>X3DH (X25519 / Ed25519)</span>
          </div>
          <div className="flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
            <span>Forward Secrecy</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>Per-Message Symmetric Ratchet</span>
          </div>
          <div className="flex justify-between">
            <span>Key Storage</span>
            <span className="font-mono" style={{ color: 'var(--ink)' }}>Client-side IndexedDB only</span>
          </div>
        </div>

        {/* Zero-Plaintext Audit Proof Button */}
        <div>
          <button
            type="button"
            onClick={loadAuditLogs}
            className="w-full py-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-2 hover:bg-[var(--surface-2)]"
            style={{
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
          >
            <Eye size={14} style={{ color: 'var(--accent)' }} />
            <span>View Server Zero-Plaintext Intercept Proof</span>
          </button>
        </div>

        {/* Server Audit Logs View */}
        {showAuditLogs && (
          <div
            className="p-4 rounded-xl border text-xs space-y-2 overflow-x-auto"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
            }}
          >
            <span className="font-medium block" style={{ color: 'var(--ink)' }}>
              Server-Intercepted Payloads (Zero Plaintext Verified):
            </span>
            {auditLogs.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No messages logged yet. Send a message to see raw ciphertext!</span>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-2 rounded bg-[var(--bg)] font-mono text-[11px] break-all border" style={{ borderColor: 'var(--line)' }}>
                  <div style={{ color: 'var(--accent)' }}>Msg: {log.clientMessageId}</div>
                  <div style={{ color: 'var(--muted)' }}>Payload: {log.ciphertextSample}</div>
                  <div style={{ color: 'var(--muted)' }}>Nonce: {log.nonce}</div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default SecurityDetailsScreen;
