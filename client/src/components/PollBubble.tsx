import React from 'react';
import { Check, BarChart2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';

interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

interface PollData {
  pollId: string;
  question: string;
  options: PollOption[];
  multipleAnswers?: boolean;
  hasVoted?: boolean;
}

interface PollBubbleProps {
  messageId: string;
  poll: PollData;
  isSent: boolean;
}

export function PollBubble({ messageId, poll, isSent }: PollBubbleProps) {
  const { user } = useAuth();
  const { votePoll } = useChat();

  const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.voterIds?.length || 0), 0);
  const currentUserId = user?.id || '';

  const handleSelectOption = (index: number) => {
    const isSelected = poll.options[index]?.voterIds?.includes(currentUserId);
    let nextIndexes: number[] = [];

    if (poll.multipleAnswers) {
      poll.options.forEach((opt, idx) => {
        const selected = idx === index ? !isSelected : opt.voterIds?.includes(currentUserId);
        if (selected) nextIndexes.push(idx);
      });
    } else {
      nextIndexes = isSelected ? [] : [index];
    }

    votePoll(messageId, poll.pollId, nextIndexes);
  };

  return (
    <div className="w-full max-w-sm rounded-2xl p-4 flex flex-col gap-3 select-none">
      <div className="flex items-center gap-2">
        <BarChart2 size={18} style={{ color: 'var(--accent)' }} />
        <h4 className="text-sm font-semibold tracking-tight font-serif break-words">
          {poll.question}
        </h4>
      </div>

      <div className="flex flex-col gap-2">
        {poll.options.map((option, idx) => {
          const voteCount = option.voterIds?.length || 0;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isUserVoted = Boolean(currentUserId && option.voterIds?.includes(currentUserId));

          return (
            <button
              key={option.id || idx}
              type="button"
              onClick={() => handleSelectOption(idx)}
              className="relative overflow-hidden rounded-xl border p-2.5 text-left cursor-pointer transition-all flex items-center justify-between gap-3 group"
              style={{
                backgroundColor: 'var(--surface-1)',
                borderColor: isUserVoted ? 'var(--accent)' : 'var(--line)',
              }}
            >
              {/* Animated Progress Bar fill */}
              <div
                className="absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none opacity-25"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: 'var(--accent)',
                }}
              />

              <div className="relative z-10 flex items-center gap-2.5 flex-1 min-w-0">
                <div
                  className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors"
                  style={{
                    borderColor: isUserVoted ? 'var(--accent)' : 'gray',
                    backgroundColor: isUserVoted ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {isUserVoted && <Check size={11} className="text-black stroke-[3]" />}
                </div>
                <span className="text-xs font-medium truncate">{option.text}</span>
              </div>

              <div className="relative z-10 shrink-0 text-right">
                <span className="text-[11px] font-mono font-semibold" style={{ color: 'var(--muted)' }}>
                  {percentage}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] pt-1" style={{ color: 'var(--muted)' }}>
        <span>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          {poll.multipleAnswers ? ' • Select one or more' : ''}
        </span>
      </div>
    </div>
  );
}
