import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  X,
  ShieldAlert,
  UserCheck,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import {
  apiGetContactRequests,
  apiAcceptContactRequest,
  apiIgnoreContactRequest,
  apiBlockUser,
  apiReportUser,
  ContactRequestItem,
} from '../lib/api';

export function RequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ContactRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGetContactRequests();
      setRequests(data.requests);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAccept = async (reqItem: ContactRequestItem) => {
    setActiveActionId(reqItem.id);
    try {
      await apiAcceptContactRequest(reqItem.id);
      setRequests((prev) => prev.filter((r) => r.id !== reqItem.id));
      navigate(`/chat/${reqItem.sender.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to accept request');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleIgnore = async (reqId: string) => {
    setActiveActionId(reqId);
    try {
      await apiIgnoreContactRequest(reqId);
      setRequests((prev) => prev.filter((r) => r.id !== reqId));
    } catch (err: any) {
      setError(err.message || 'Failed to ignore request');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleBlock = async (reqItem: ContactRequestItem) => {
    if (!window.confirm(`Block @${reqItem.sender.username}? They will not be able to message or see you.`)) {
      return;
    }
    setActiveActionId(reqItem.id);
    try {
      await apiBlockUser(reqItem.sender.id, 'Blocked from requests');
      setRequests((prev) => prev.filter((r) => r.id !== reqItem.id));
    } catch (err: any) {
      setError(err.message || 'Failed to block user');
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div
      className="flex flex-col min-h-dvh select-none"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header
        className="px-4 py-3 flex items-center gap-3 pt-safe"
        style={{
          borderBottom: '1px solid var(--line)',
          backgroundColor: 'var(--bg)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-1.5 rounded-full transition-opacity hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--ink)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          Message Requests
        </h1>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col gap-4">
        {error && (
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{
              backgroundColor: 'rgba(180, 69, 47, 0.1)',
              color: 'var(--heart)',
              border: '1px solid rgba(180, 69, 47, 0.2)',
            }}
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10 text-xs" style={{ color: 'var(--muted)' }}>
            Checking for requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto py-16 text-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface-1)', color: 'var(--muted)' }}
            >
              <Inbox size={28} />
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '18px',
                fontWeight: 500,
                color: 'var(--ink)',
              }}
            >
              No Pending Requests
            </h3>
            <p className="text-xs max-w-xs" style={{ color: 'var(--muted)', lineHeight: 1.4 }}>
              When people outside your contacts connect via your @username, their messages will appear here for your approval.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              {requests.length} Pending {requests.length === 1 ? 'Request' : 'Requests'}
            </p>

            {requests.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl flex flex-col gap-3.5 shadow-sm"
                style={{
                  backgroundColor: 'var(--surface-1)',
                  border: '1px solid var(--line)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-serif font-bold text-sm"
                    style={{
                      backgroundColor: `var(--tint-${(item.sender.avatarTint % 4) + 1}, #D9CDB8)`,
                      color: '#1D1B18',
                    }}
                  >
                    {(item.sender.displayName || item.sender.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                      {item.sender.displayName || item.sender.username}
                    </h4>
                    <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>
                      @{item.sender.username}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--line)' }}>
                  <button
                    type="button"
                    disabled={activeActionId === item.id}
                    onClick={() => handleAccept(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-opacity"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-ink)',
                    }}
                  >
                    <Check size={14} />
                    <span>Accept</span>
                  </button>

                  <button
                    type="button"
                    disabled={activeActionId === item.id}
                    onClick={() => handleIgnore(item.id)}
                    className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      color: 'var(--ink)',
                    }}
                  >
                    <X size={14} />
                    <span>Ignore</span>
                  </button>

                  <button
                    type="button"
                    disabled={activeActionId === item.id}
                    onClick={() => handleBlock(item)}
                    className="p-2 rounded-lg text-xs cursor-pointer hover:bg-black/5"
                    style={{ color: 'var(--heart)' }}
                    title="Block User"
                  >
                    <ShieldAlert size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestsPage;
