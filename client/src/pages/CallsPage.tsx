import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, PhoneCall } from 'lucide-react';
import { useCall } from '../contexts/CallContext';

interface CallRecord {
  id: string;
  userId: string;
  name: string;
  initials: string;
  tint: 'tint-1' | 'tint-2' | 'tint-3' | 'tint-4';
  time: string;
  type: 'incoming' | 'outgoing' | 'missed';
  details: string;
  isVideo?: boolean;
}

const CALLS_DATA: CallRecord[] = [
  {
    id: 'c1',
    userId: 'user_maya',
    name: 'Maya Lin',
    initials: 'ML',
    tint: 'tint-1',
    time: '10:14 AM',
    type: 'incoming',
    details: 'Incoming (14 mins)',
  },
  {
    id: 'c2',
    userId: 'user_julian',
    name: 'Julian Vance',
    initials: 'JV',
    tint: 'tint-2',
    time: 'Yesterday',
    type: 'outgoing',
    details: 'Outgoing video (3 mins)',
    isVideo: true,
  },
  {
    id: 'c3',
    userId: 'user_alex',
    name: 'Alex Mercer',
    initials: 'AM',
    tint: 'tint-3',
    time: 'Yesterday',
    type: 'missed',
    details: 'Missed call',
  },
  {
    id: 'c4',
    userId: 'user_elena',
    name: 'Elena Rostova',
    initials: 'ER',
    tint: 'tint-4',
    time: 'Monday',
    type: 'incoming',
    details: 'Incoming (22 mins)',
  },
];

export function CallsPage() {
  const { startCall } = useCall();
  return (
    <div className="flex flex-col min-h-full" style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Header */}
      <header className="px-5 pt-4 pb-2 flex items-baseline justify-between pt-safe">
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'var(--text-title)',
            letterSpacing: '-0.02em',
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.15,
          }}
        >
          Calls
        </h1>
        <button
          type="button"
          aria-label="New call"
          className="cursor-pointer transition-opacity hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <PhoneCall size={19} />
        </button>
      </header>

      {/* Calls List */}
      <div className="flex-1 divide-y" style={{ borderColor: 'var(--line)' }}>
        {CALLS_DATA.map((call) => (
          <div
            key={call.id}
            className="flex items-center gap-3.5 px-5 py-3 transition-colors cursor-pointer"
            style={{ borderBottom: '1px solid var(--line)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* Avatar */}
            <div
              className="shrink-0 flex items-center justify-center select-none"
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: `var(--${call.tint})`,
                color: 'var(--ink)',
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 500,
              }}
            >
              {call.initials}
            </div>

            {/* Call details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-0.5">
                <span
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'var(--text-chat-name)',
                    letterSpacing: '-0.01em',
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}
                >
                  {call.name}
                </span>

                <span
                  className="tnum shrink-0 ml-2"
                  style={{
                    fontSize: 'var(--text-meta)',
                    color: 'var(--muted)',
                  }}
                >
                  {call.time}
                </span>
              </div>

              <div
                className="flex items-center gap-1.5"
                style={{
                  fontSize: 'var(--text-secondary)',
                  color: call.type === 'missed' ? 'var(--heart)' : 'var(--muted)',
                }}
              >
                {call.type === 'incoming' && (
                  <PhoneIncoming size={13} style={{ color: 'var(--accent)' }} />
                )}
                {call.type === 'outgoing' && (
                  <PhoneOutgoing size={13} style={{ color: 'var(--muted)' }} />
                )}
                {call.type === 'missed' && (
                  <PhoneMissed size={13} style={{ color: 'var(--heart)' }} />
                )}
                <span>{call.details}</span>
              </div>
            </div>

            {/* Action button */}
            <button
              type="button"
              aria-label={call.isVideo ? 'Start video call' : 'Start phone call'}
              onClick={(e) => {
                e.stopPropagation();
                startCall(call.userId, call.name, 0, call.isVideo ? 'video' : 'voice');
              }}
              className="p-2.5 shrink-0 cursor-pointer transition-transform active:scale-95 rounded-full hover:bg-[var(--surface-1)]"
              style={{ color: 'var(--accent)' }}
            >
              {call.isVideo ? <Video size={20} /> : <Phone size={20} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CallsPage;
