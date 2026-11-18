import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { downloadAndDecryptMedia } from '../lib/encryptedMedia';

interface VoiceNotePlayerProps {
  mediaUrl: string;
  keyBase64: string;
  headerBase64: string;
  mimeType: string;
  durationSeconds?: number;
  waveform?: number[];
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  mediaUrl,
  keyBase64,
  headerBase64,
  mimeType,
  durationSeconds = 0,
  waveform,
  isPlaying,
  onTogglePlay,
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  // Fallback 64-point waveform if not provided
  const points = waveform && waveform.length > 0 ? waveform : Array(64).fill(0.2);

  // Lazy download & decrypt on demand (when user plays)
  useEffect(() => {
    if (isPlaying && !audioUrl && !loading && !error) {
      setLoading(true);
      downloadAndDecryptMedia(mediaUrl, keyBase64, headerBase64, mimeType)
        .then((url) => {
          setAudioUrl(url);
          setLoading(false);
        })
        .catch((err) => {
          console.error('[VoiceNotePlayer] Decryption error', err);
          setError(true);
          setLoading(false);
        });
    }
  }, [isPlaying, audioUrl, loading, error, mediaUrl, keyBase64, headerBase64, mimeType]);

  // Audio element play/pause control
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      audio.playbackRate = playbackRate;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl, playbackRate]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setCurrentTime(0);
    onTogglePlay();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    const totalDur = durationSeconds || (audioRef.current?.duration || 0);
    if (totalDur > 0) {
      const targetTime = ratio * totalDur;
      setCurrentTime(targetTime);
      if (audioRef.current) {
        audioRef.current.currentTime = targetTime;
      }
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate: 1 | 1.5 | 2 = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = durationSeconds || (audioRef.current?.duration || 0);
  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  const activeBarIndex = Math.floor(progressRatio * points.length);

  if (error) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-xl text-xs text-[var(--heart)] bg-black/5">
        <AlertCircle size={15} />
        <span>Failed to decrypt audio</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 p-2 rounded-2xl select-none max-w-xs w-full"
      style={{
        backgroundColor: 'var(--surface-1)',
        color: 'var(--ink)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}

      {/* Play / Pause / Loading button */}
      <button
        type="button"
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        disabled={loading}
        onClick={onTogglePlay}
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-90"
        style={{
          backgroundColor: 'var(--ink)',
          color: 'var(--bg)',
        }}
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      {/* 64-Point Interactive Waveform */}
      <div
        ref={waveformRef}
        onClick={handleSeek}
        className="flex-1 flex items-center gap-[2px] h-7 cursor-pointer py-1"
        title="Tap to seek"
      >
        {points.map((amp, idx) => {
          const isActive = idx <= activeBarIndex;
          const barHeight = Math.max(4, Math.round(amp * 24));
          return (
            <span
              key={idx}
              className="flex-1 rounded-full transition-colors duration-100"
              style={{
                height: `${barHeight}px`,
                backgroundColor: isActive ? 'var(--accent)' : 'var(--ink)',
                opacity: isActive ? 1 : 0.4,
              }}
            />
          );
        })}
      </div>

      {/* Time & Playback speed badge */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[11px] tnum font-medium" style={{ color: 'var(--muted)' }}>
          {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
        </span>

        <button
          type="button"
          onClick={cyclePlaybackRate}
          aria-label={`Playback speed: ${playbackRate}x`}
          className="text-[10px] px-1.5 py-0.2 rounded-md font-bold transition-transform active:scale-95 cursor-pointer"
          style={{
            backgroundColor: playbackRate > 1 ? 'var(--accent)' : 'var(--surface-2)',
            color: playbackRate > 1 ? 'var(--accent-ink)' : 'var(--muted)',
          }}
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
};

export default VoiceNotePlayer;
