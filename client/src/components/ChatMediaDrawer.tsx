import React, { useState, useMemo } from 'react';
import { X, Image, Mic, Link2, Star, Play, Pause, ExternalLink } from 'lucide-react';
import { LocalMessage } from '../lib/db';
import { useChat } from '../contexts/ChatContext';

interface ChatMediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  partnerName: string;
  onOpenLink: (url: string) => void;
}

export function ChatMediaDrawer({
  isOpen,
  onClose,
  partnerName,
  onOpenLink,
}: ChatMediaDrawerProps) {
  const { messages, toggleStarMessage } = useChat();
  const [activeTab, setActiveTab] = useState<'media' | 'voice' | 'links' | 'starred'>('media');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter local messages for each tab
  const mediaMessages = useMemo(() => {
    return messages.filter((m) => m.type === 'photo' && m.mediaUrl);
  }, [messages]);

  const voiceMessages = useMemo(() => {
    return messages.filter((m) => m.type === 'voice');
  }, [messages]);

  const linkMessages = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const items: { messageId: string; url: string; date: string }[] = [];
    messages.forEach((m) => {
      const matches = m.content.match(urlRegex);
      if (matches) {
        matches.forEach((url) => {
          items.push({ messageId: m.id, url, date: m.createdAt });
        });
      }
    });
    return items;
  }, [messages]);

  const starredMessages = useMemo(() => {
    return messages.filter((m) => m.isStarred);
  }, [messages]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shared Media and Starred Messages"
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs select-none animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderLeft: '1px solid var(--line)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="px-5 py-4 border-b flex items-center justify-between pt-safe"
          style={{ borderColor: 'var(--line)' }}
        >
          <div>
            <h2 className="text-base font-semibold font-serif">Shared Media &amp; Starred</h2>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {partnerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        {/* Tab Switcher */}
        <div
          className="flex border-b text-xs font-medium"
          style={{ borderColor: 'var(--line)' }}
        >
          {[
            { id: 'media', label: `Photos (${mediaMessages.length})`, icon: Image },
            { id: 'voice', label: `Voice (${voiceMessages.length})`, icon: Mic },
            { id: 'links', label: `Links (${linkMessages.length})`, icon: Link2 },
            { id: 'starred', label: `Starred (${starredMessages.length})`, icon: Star },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className="flex-1 py-3 text-center border-b-2 transition-all flex flex-col items-center gap-1 cursor-pointer"
                style={{
                  borderColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <tab.icon size={16} style={{ color: isActive ? 'var(--accent)' : 'inherit' }} />
                <span className="text-[11px] truncate px-1">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {/* 1. Photos Grid */}
          {activeTab === 'media' && (
            <div>
              {mediaMessages.length === 0 ? (
                <div className="py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  No photos shared in this chat.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mediaMessages.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSelectedPhoto(m.mediaUrl || null)}
                      className="aspect-square rounded-xl overflow-hidden border cursor-pointer hover:opacity-90 relative"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <img
                        src={m.mediaUrl}
                        alt="Shared media"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Voice Notes List */}
          {activeTab === 'voice' && (
            <div className="space-y-2">
              {voiceMessages.length === 0 ? (
                <div className="py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  No voice notes shared in this chat.
                </div>
              ) : (
                voiceMessages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl border flex items-center justify-between gap-3"
                    style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--surface-2)' }}
                      >
                        <Mic size={16} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">
                          Voice note ({m.voiceDuration ? `${Math.round(m.voiceDuration)}s` : 'Audio'})
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          {new Date(m.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 3. Links List */}
          {activeTab === 'links' && (
            <div className="space-y-2">
              {linkMessages.length === 0 ? (
                <div className="py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  No links found in this chat.
                </div>
              ) : (
                linkMessages.map((l, idx) => (
                  <div
                    key={idx}
                    onClick={() => onOpenLink(l.url)}
                    className="p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer hover:bg-black/5"
                    style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg)' }}
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Link2 size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
                      <div className="truncate text-xs font-mono">{l.url}</div>
                    </div>
                    <ExternalLink size={14} className="shrink-0" style={{ color: 'var(--muted)' }} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* 4. Starred Messages */}
          {activeTab === 'starred' && (
            <div className="space-y-2">
              {starredMessages.length === 0 ? (
                <div className="py-16 text-center text-xs" style={{ color: 'var(--muted)' }}>
                  No starred messages in this chat.
                </div>
              ) : (
                starredMessages.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-2xl border flex flex-col gap-2"
                    style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg)' }}
                  >
                    <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--muted)' }}>
                      <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                      <button
                        type="button"
                        onClick={() => toggleStarMessage(m.id)}
                        className="p-1 hover:bg-black/5 rounded cursor-pointer"
                        title="Unstar message"
                      >
                        <Star size={14} className="fill-amber-400 text-amber-400" />
                      </button>
                    </div>
                    <p className="text-xs break-words">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Lightbox for full photo preview */}
        {selectedPhoto && (
          <div
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setSelectedPhoto(null)}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full bg-white/10"
              aria-label="Close photo"
            >
              <X size={24} />
            </button>
            <img
              src={selectedPhoto}
              alt="Full preview"
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
