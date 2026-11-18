import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Search, Share2 } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

export function ShareTargetPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { chats } = useChat();

  const title = searchParams.get('title') || '';
  const text = searchParams.get('text') || '';
  const url = searchParams.get('url') || '';

  const sharedContent = [title, text, url].filter(Boolean).join(' ');

  const [filter, setFilter] = useState('');

  const filteredContacts = chats.filter((c) => {
    const q = filter.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.username && c.username.toLowerCase().includes(q))
    );
  });

  const handleSelectContact = (contactId: string) => {
    navigate(`/chat/${contactId}?prefill=${encodeURIComponent(sharedContent)}`);
  };

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      {/* Header */}
      <header
        className="px-4 py-3 border-b flex items-center gap-3 pt-safe"
        style={{ borderColor: 'var(--line)' }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-1 rounded-full hover:bg-black/5 cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-base font-semibold font-serif">Share via WhatsUs</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Select a contact to send to
          </p>
        </div>
      </header>

      {/* Shared Content Preview Banner */}
      {sharedContent && (
        <div
          className="mx-4 mt-3 p-3 rounded-2xl border flex items-start gap-2.5"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
          }}
        >
          <Share2 size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1 overflow-hidden">
            <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--muted)' }}>
              Content to Share
            </span>
            <p className="text-xs line-clamp-3 font-mono mt-0.5 break-words">
              {sharedContent}
            </p>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="p-4">
        <div
          className="flex items-center px-3 py-2 rounded-xl border gap-2"
          style={{
            backgroundColor: 'var(--surface-1)',
            borderColor: 'var(--line)',
          }}
        >
          <Search size={16} style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search contacts..."
            className="flex-1 text-xs bg-transparent focus:outline-none"
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-2 no-scrollbar">
        {filteredContacts.length === 0 ? (
          <div className="py-8 text-center text-xs" style={{ color: 'var(--muted)' }}>
            No contacts or conversations found.
          </div>
        ) : (
          filteredContacts.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelectContact(c.id)}
              className="flex items-center justify-between p-3 rounded-2xl border cursor-pointer hover:bg-black/5 transition-all"
              style={{
                backgroundColor: 'var(--surface-1)',
                borderColor: 'var(--line)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-sm font-semibold text-black"
                  style={{
                    backgroundColor: `var(--tint-${((c.tint || 0) % 4) + 1}, #D9CDB8)`,
                  }}
                >
                  {(c.name || c.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-semibold">{c.name || c.username}</div>
                  <div className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                    @{c.username}
                  </div>
                </div>
              </div>

              <div
                className="p-2 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                <Send size={14} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ShareTargetPage;
