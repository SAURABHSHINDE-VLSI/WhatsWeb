import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, KeyRound, AlertCircle, ShieldCheck } from 'lucide-react';
import { isPlatformAuthenticatorAvailable } from '../lib/passkeyClient';

interface AppLockContextType {
  isLocked: boolean;
  isAppLockEnabled: boolean;
  hasPin: boolean;
  useBiometrics: boolean;
  lockTimeoutMs: number;
  lockNow: () => void;
  unlockWithPin: (pin: string) => boolean;
  unlockWithBiometrics: () => Promise<boolean>;
  enableAppLock: (pin: string, useBiometrics?: boolean, timeoutMs?: number) => Promise<void>;
  disableAppLock: (pin: string) => boolean;
  updateTimeout: (timeoutMs: number) => void;
}

const AppLockContext = createContext<AppLockContextType | null>(null);

const STORAGE_ENABLED = 'whatsus_applock_enabled';
const STORAGE_PIN_HASH = 'whatsus_applock_pinhash';
const STORAGE_PIN_SALT = 'whatsus_applock_pinsalt';
const STORAGE_USE_BIOMETRICS = 'whatsus_applock_biometrics';
const STORAGE_TIMEOUT = 'whatsus_applock_timeout';

async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(pin + salt);
  const hashBuf = await window.crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_ENABLED) === 'true';
  });

  const [hasPin, setHasPin] = useState(() => {
    return Boolean(localStorage.getItem(STORAGE_PIN_HASH));
  });

  const [useBiometrics, setUseBiometrics] = useState(() => {
    return localStorage.getItem(STORAGE_USE_BIOMETRICS) === 'true';
  });

  const [lockTimeoutMs, setLockTimeoutMs] = useState(() => {
    const val = localStorage.getItem(STORAGE_TIMEOUT);
    return val ? parseInt(val, 10) : 0; // 0 = immediately
  });

  const [isLocked, setIsLocked] = useState(() => {
    return localStorage.getItem(STORAGE_ENABLED) === 'true';
  });

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isBiometricPrompting, setIsBiometricPrompting] = useState(false);

  // Background blur to prevent app switcher leaks
  useEffect(() => {
    if (isLocked) {
      document.body.classList.add('app-locked');
    } else {
      document.body.classList.remove('app-locked');
    }
  }, [isLocked]);

  // Handle visibility & auto-lock
  useEffect(() => {
    if (!isAppLockEnabled) return;

    let backgroundedAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        backgroundedAt = Date.now();
      } else {
        if (backgroundedAt > 0) {
          const elapsed = Date.now() - backgroundedAt;
          if (elapsed >= lockTimeoutMs) {
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAppLockEnabled, lockTimeoutMs]);

  const lockNow = useCallback(() => {
    if (isAppLockEnabled) {
      setIsLocked(true);
      setPinInput('');
      setPinError('');
    }
  }, [isAppLockEnabled]);

  const unlockWithPin = useCallback(
    (enteredPin: string): boolean => {
      const storedHash = localStorage.getItem(STORAGE_PIN_HASH);
      const storedSalt = localStorage.getItem(STORAGE_PIN_SALT);
      if (!storedHash || !storedSalt) return false;

      // Synchronous quick check with precomputed check or async hash
      // Compute hash
      hashPin(enteredPin, storedSalt).then((calcHash) => {
        if (calcHash === storedHash) {
          setIsLocked(false);
          setPinInput('');
          setPinError('');
        } else {
          setPinError('Incorrect PIN');
        }
      });

      return true;
    },
    []
  );

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (!useBiometrics) return false;
    setIsBiometricPrompting(true);
    setPinError('');
    try {
      // Trigger WebAuthn platform biometric check
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const res = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          userVerification: 'required',
          timeout: 60000,
        },
      });
      if (res) {
        setIsLocked(false);
        setPinInput('');
        return true;
      }
    } catch (err) {
      console.warn('Biometric verification cancelled or unavailable', err);
    } finally {
      setIsBiometricPrompting(false);
    }
    return false;
  }, [useBiometrics]);

  // Attempt biometric unlock on initial lock screen mount if enabled
  useEffect(() => {
    if (isLocked && useBiometrics) {
      unlockWithBiometrics().catch(() => {});
    }
  }, [isLocked, useBiometrics, unlockWithBiometrics]);

  const enableAppLock = useCallback(
    async (pin: string, enableBiometrics = false, timeoutMs = 0) => {
      if (pin.length < 4) {
        throw new Error('PIN must be at least 4 digits');
      }

      const salt = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const hash = await hashPin(pin, salt);

      localStorage.setItem(STORAGE_ENABLED, 'true');
      localStorage.setItem(STORAGE_PIN_HASH, hash);
      localStorage.setItem(STORAGE_PIN_SALT, salt);
      localStorage.setItem(STORAGE_USE_BIOMETRICS, enableBiometrics ? 'true' : 'false');
      localStorage.setItem(STORAGE_TIMEOUT, timeoutMs.toString());

      setIsAppLockEnabled(true);
      setHasPin(true);
      setUseBiometrics(enableBiometrics);
      setLockTimeoutMs(timeoutMs);
    },
    []
  );

  const disableAppLock = useCallback((currentPin: string): boolean => {
    const storedHash = localStorage.getItem(STORAGE_PIN_HASH);
    const storedSalt = localStorage.getItem(STORAGE_PIN_SALT);
    if (!storedHash || !storedSalt) return false;

    hashPin(currentPin, storedSalt).then((calcHash) => {
      if (calcHash === storedHash) {
        localStorage.removeItem(STORAGE_ENABLED);
        localStorage.removeItem(STORAGE_PIN_HASH);
        localStorage.removeItem(STORAGE_PIN_SALT);
        localStorage.removeItem(STORAGE_USE_BIOMETRICS);
        localStorage.removeItem(STORAGE_TIMEOUT);

        setIsAppLockEnabled(false);
        setHasPin(false);
        setIsLocked(false);
        return true;
      }
      return false;
    });

    return true;
  }, []);

  const updateTimeout = useCallback((timeoutMs: number) => {
    localStorage.setItem(STORAGE_TIMEOUT, timeoutMs.toString());
    setLockTimeoutMs(timeoutMs);
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        isAppLockEnabled,
        hasPin,
        useBiometrics,
        lockTimeoutMs,
        lockNow,
        unlockWithPin,
        unlockWithBiometrics,
        enableAppLock,
        disableAppLock,
        updateTimeout,
      }}
    >
      {children}

      {/* Full-Screen App Lock Modal */}
      {isLocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="App Lock"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-xl select-none animate-in fade-in"
        >
          <div
            className="w-full max-w-sm rounded-3xl p-8 border text-center flex flex-col items-center gap-6 shadow-2xl"
            style={{
              backgroundColor: 'var(--surface-1)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-inner"
              style={{ backgroundColor: 'var(--surface-2)' }}
            >
              <Lock size={32} style={{ color: 'var(--accent)' }} />
            </div>

            <div>
              <h2 className="text-xl font-serif font-bold tracking-tight">WhatsUs is Locked</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Enter your PIN or use biometrics to continue
              </p>
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-xs text-red-500 font-medium animate-shake">
                <AlertCircle size={14} />
                <span>{pinError}</span>
              </div>
            )}

            {/* PIN Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinInput.length >= 4) {
                  unlockWithPin(pinInput);
                }
              }}
              className="w-full flex flex-col gap-4"
            >
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                placeholder="Enter PIN"
                autoFocus
                className="w-full text-center text-2xl tracking-widest font-mono py-3 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg)',
                  borderColor: 'var(--line)',
                  color: 'var(--ink)',
                }}
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pinInput.length < 4}
                  className="flex-1 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  Unlock
                </button>

                {useBiometrics && (
                  <button
                    type="button"
                    onClick={() => unlockWithBiometrics()}
                    disabled={isBiometricPrompting}
                    className="p-3 rounded-xl border flex items-center justify-center cursor-pointer hover:bg-black/5"
                    style={{ borderColor: 'var(--line)' }}
                    title="Unlock with Biometrics"
                    aria-label="Unlock with Biometrics"
                  >
                    <Fingerprint size={22} style={{ color: 'var(--accent)' }} />
                  </button>
                )}
              </div>
            </form>

            <p className="text-[11px] leading-relaxed max-w-xs" style={{ color: 'var(--muted)' }}>
              App Lock protects against unauthorized access on this device.
            </p>
          </div>
        </div>
      )}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
}
