import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showResetConfirm: boolean;
  isResetting: boolean;
}

/**
 * Sanitizes an error message or stack trace so no keys, tokens, emails,
 * message contents, or private URLs are ever displayed or logged.
 */
function sanitizeErrorMessage(error: Error | null): string {
  if (!error) return 'An unexpected system error occurred.';
  let msg = error.message || error.toString();
  // Strip JWTs
  msg = msg.replace(/ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]');
  // Strip Bearer tokens
  msg = msg.replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED]');
  // Strip Emails
  msg = msg.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  // Strip Base64 long strings (keys)
  msg = msg.replace(/[A-Za-z0-9+/=]{40,}/g, '[REDACTED_KEY]');
  // Strip query parameters
  msg = msg.replace(/\?[^#\s]*/g, '?[REDACTED_PARAMS]');
  return msg;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showResetConfirm: false,
    isResetting: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      showResetConfirm: false,
      isResetting: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const sanitized = sanitizeErrorMessage(error);
    console.error('[AppErrorBoundary] Handled crash:', sanitized, {
      componentStack: errorInfo.componentStack?.slice(0, 300),
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetLocalData = async () => {
    this.setState({ isResetting: true });
    try {
      // Clear IndexedDB databases
      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase('editorial_messenger_v1');
        indexedDB.deleteDatabase('editorial_crypto_keystore_v2');
        if (indexedDB.databases) {
          try {
            const dbs = await indexedDB.databases();
            for (const db of dbs) {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            }
          } catch (_) {
            // Ignore if databases enumeration fails
          }
        }
      }

      // Clear storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear CacheStorage (Service Worker caches)
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (_) {}
      }

      // Unregister service workers
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
        } catch (_) {}
      }
    } catch (err) {
      console.error('[AppErrorBoundary] Reset error:', err);
    } finally {
      window.location.href = '/login';
    }
  };

  public render() {
    if (this.state.hasError) {
      const sanitizedMsg = sanitizeErrorMessage(this.state.error);

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-dvh flex items-center justify-center p-6 bg-[var(--bg)] text-[var(--ink)] font-sans"
        >
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-center space-x-3 text-amber-500">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--ink)]">Something went wrong</h1>
                <p className="text-xs text-[var(--ink-secondary)]">The application encountered an unexpected error</p>
              </div>
            </div>

            <div className="bg-[var(--surface-hover)] border border-[var(--border)] p-3 rounded-lg text-xs font-mono text-[var(--ink-secondary)] break-all max-h-32 overflow-y-auto">
              {sanitizedMsg}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 rounded-xl font-medium bg-[var(--accent)] text-white hover:opacity-95 transition-opacity flex items-center justify-center space-x-2 shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              {!this.state.showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => this.setState({ showResetConfirm: true })}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center justify-center space-x-1.5 focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Troubleshoot: Reset Local Data</span>
                </button>
              ) : (
                <div className="p-3 border border-rose-500/30 bg-rose-500/5 rounded-xl space-y-3">
                  <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    ⚠️ <strong>Destructive Action:</strong> Resetting local data permanently wipes all local encrypted
                    keys, stored chats, and active sessions on this device. You will need to sign in again.
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={this.state.isResetting}
                      onClick={this.handleResetLocalData}
                      className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      {this.state.isResetting ? 'Wiping data...' : 'Confirm Reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => this.setState({ showResetConfirm: false })}
                      className="py-2 px-3 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
