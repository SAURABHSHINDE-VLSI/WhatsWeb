import React, { useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  Lock,
} from 'lucide-react';
import { useCall } from '../contexts/CallContext';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function CallModal() {
  const {
    callState,
    callType,
    partner,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    duration,
    errorMessage,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    switchCamera,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callType]);

  // Attach remote stream
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current && callType === 'video') {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callType]);

  if (callState === 'idle' && !errorMessage) {
    return null;
  }

  const avatarTintClass = partner?.avatarTint !== undefined ? `tint-${partner.avatarTint + 1}` : 'tint-1';
  const partnerInitials = partner?.name
    ? partner.name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '??';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200"
      style={{
        backgroundColor: callType === 'video' && callState === 'connected' ? '#000000' : 'var(--bg)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Hidden audio element for voice streaming */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Video Call Elements (if connected and video call) */}
      {callType === 'video' && callState === 'connected' && (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {/* Remote Video Stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Picture-in-Picture Local Video Stream */}
          {localStream && !isVideoOff && (
            <div
              className="absolute top-12 right-4 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shadow-2xl border border-white/20 z-20 bg-neutral-900"
              style={{
                top: 'max(48px, env(safe-area-inset-top, 48px))',
              }}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Top Bar: Security Note & Call State */}
      <div
        className="w-full flex flex-col items-center pt-safe z-30 px-6 pt-4"
        style={{
          background:
            callType === 'video' && callState === 'connected'
              ? 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)'
              : 'transparent',
          color: callType === 'video' && callState === 'connected' ? '#FFFFFF' : 'var(--ink)',
        }}
      >
        <div
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium tracking-wide mb-3 backdrop-blur-sm"
          style={{
            backgroundColor:
              callType === 'video' && callState === 'connected'
                ? 'rgba(255, 255, 255, 0.15)'
                : 'var(--surface-1)',
            color:
              callType === 'video' && callState === 'connected'
                ? '#FFFFFF'
                : 'var(--muted)',
          }}
        >
          <Lock size={12} />
          <span>End-to-end encrypted</span>
        </div>

        {errorMessage ? (
          <div className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 text-sm font-medium animate-pulse">
            {errorMessage}
          </div>
        ) : (
          <div
            className="text-sm font-medium tracking-wide"
            style={{
              color:
                callType === 'video' && callState === 'connected'
                  ? 'rgba(255,255,255,0.8)'
                  : 'var(--muted)',
            }}
          >
            {callState === 'calling' && 'Calling...'}
            {callState === 'incoming' &&
              (callType === 'video' ? 'Incoming Video Call...' : 'Incoming Voice Call...')}
            {callState === 'connected' && formatDuration(duration)}
          </div>
        )}
      </div>

      {/* Center Body: Partner Avatar & Name (visible when not fullscreen video) */}
      {(callType === 'voice' || callState !== 'connected') && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 z-20">
          {/* Animated Avatar Circle */}
          <div className="relative mb-6">
            {(callState === 'calling' || callState === 'incoming') && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-25"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            <div
              className="w-28 h-28 sm:w-36 sm:h-36 rounded-full flex items-center justify-center shadow-xl select-none"
              style={{
                backgroundColor: `var(--${avatarTintClass})`,
                color: 'var(--ink)',
                fontFamily: 'var(--font-serif)',
                fontSize: '42px',
                fontWeight: 500,
                border: '3px solid var(--line)',
              }}
            >
              {partnerInitials}
            </div>
          </div>

          <h2
            className="text-2xl sm:text-3xl font-medium tracking-tight mb-2"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--ink)',
            }}
          >
            {partner?.name || 'Contact'}
          </h2>

          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {callType === 'video' ? 'Video Call' : 'Voice Call'}
          </p>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div
        className="w-full flex flex-col items-center pb-safe z-30 px-6 pb-8"
        style={{
          background:
            callType === 'video' && callState === 'connected'
              ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)'
              : 'transparent',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))',
        }}
      >
        {callState === 'incoming' ? (
          /* Incoming Call Actions: Accept or Decline */
          <div className="flex items-center gap-10">
            <button
              type="button"
              onClick={rejectCall}
              aria-label="Decline call"
              className="w-16 h-16 rounded-full flex items-center justify-center bg-red-600 text-white shadow-lg active:scale-95 transition-transform cursor-pointer"
            >
              <PhoneOff size={28} />
            </button>

            <button
              type="button"
              onClick={acceptCall}
              aria-label="Accept call"
              className="w-16 h-16 rounded-full flex items-center justify-center bg-emerald-600 text-white shadow-lg active:scale-95 transition-transform cursor-pointer animate-bounce"
            >
              {callType === 'video' ? <Video size={28} /> : <Phone size={28} />}
            </button>
          </div>
        ) : (
          /* Active Call Controls */
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Mic Toggle */}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className="w-13 h-13 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: isMuted ? 'var(--heart)' : 'var(--surface-1)',
                color: isMuted ? '#FFFFFF' : 'var(--ink)',
              }}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* Video Toggle */}
            <button
              type="button"
              onClick={toggleVideo}
              aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              className="w-13 h-13 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: isVideoOff ? 'var(--heart)' : 'var(--surface-1)',
                color: isVideoOff ? '#FFFFFF' : 'var(--ink)',
              }}
            >
              {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>

            {/* Camera Switch (Mobile Flip) */}
            {callType === 'video' && (
              <button
                type="button"
                onClick={switchCamera}
                aria-label="Switch camera"
                className="w-13 h-13 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-1)',
                  color: 'var(--ink)',
                }}
              >
                <SwitchCamera size={22} />
              </button>
            )}

            {/* End Call Button */}
            <button
              type="button"
              onClick={endCall}
              aria-label="End call"
              className="w-14 h-14 rounded-full flex items-center justify-center bg-red-600 text-white shadow-xl active:scale-95 transition-transform cursor-pointer ml-2"
            >
              <PhoneOff size={26} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
