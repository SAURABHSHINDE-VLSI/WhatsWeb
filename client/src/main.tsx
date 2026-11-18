import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * Strips secrets, tokens, keys, message contents, and user emails from error reports.
 */
function scrubSensitiveData(raw: unknown): string {
  if (typeof raw !== 'string') {
    try {
      raw = JSON.stringify(raw);
    } catch (_) {
      raw = String(raw);
    }
  }
  let str = String(raw);
  str = str.replace(/ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]');
  str = str.replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED]');
  str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  str = str.replace(/[A-Za-z0-9+/=]{40,}/g, '[REDACTED_KEY]');
  str = str.replace(/\?[^#\s]*/g, '?[REDACTED_PARAMS]');
  return str;
}

// Global window unhandled error listener
window.addEventListener('error', (event) => {
  console.error('[GlobalError]', scrubSensitiveData(event.message), {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Global window unhandled promise rejection listener
window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', scrubSensitiveData(event.reason));
});

const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to find root element');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
