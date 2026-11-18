import React, { useState } from 'react';
import { X, Plus, Trash2, BarChart2 } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePollModal({ isOpen, onClose }: CreatePollModalProps) {
  const { sendPoll } = useChat();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multipleAnswers, setMultipleAnswers] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (text: string, index: number) => {
    const next = [...options];
    next[index] = text;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('Please provide at least 2 non-empty options');
      return;
    }

    try {
      await sendPoll(question.trim(), cleanOptions, multipleAnswers);
      onClose();
      setQuestion('');
      setOptions(['', '']);
      setError('');
    } catch (err) {
      setError('Failed to create poll');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Poll"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl flex flex-col gap-4 animate-in zoom-in-95"
        style={{
          backgroundColor: 'var(--surface-1)',
          borderColor: 'var(--line)',
          color: 'var(--ink)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} style={{ color: 'var(--accent)' }} />
            <h3 className="text-base font-semibold font-serif">Create a Poll</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl text-xs bg-red-500/10 text-red-500 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setError('');
              }}
              placeholder="Ask a question..."
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg)',
                borderColor: 'var(--line)',
                color: 'var(--ink)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>
              Options
            </label>
            <div className="flex flex-col gap-2">
              {options.map((option, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(e.target.value, idx)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3.5 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={{
                      backgroundColor: 'var(--bg)',
                      borderColor: 'var(--line)',
                      color: 'var(--ink)',
                    }}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg cursor-pointer"
                      aria-label="Delete option"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 6 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                <Plus size={14} /> Add Option
              </button>
            )}
          </div>

          {/* Multiple Answers Toggle */}
          <div
            className="flex items-center justify-between p-3 rounded-xl border"
            style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg)' }}
          >
            <span className="text-xs font-medium">Allow multiple answers</span>
            <button
              type="button"
              role="switch"
              aria-checked={multipleAnswers}
              aria-label="Allow multiple answers"
              onClick={() => setMultipleAnswers(!multipleAnswers)}
              className="w-11 h-6 rounded-full relative transition-colors cursor-pointer"
              style={{
                backgroundColor: multipleAnswers ? 'var(--accent)' : 'var(--line)',
              }}
            >
              <span
                className="block w-5 h-5 rounded-full transition-transform absolute top-0.5 left-0.5"
                style={{
                  backgroundColor: 'var(--accent-ink)',
                  transform: multipleAnswers ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl font-medium text-xs transition-all cursor-pointer shadow"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Send Poll
          </button>
        </form>
      </div>
    </div>
  );
}
