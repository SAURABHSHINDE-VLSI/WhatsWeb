/**
 * Robust Cross-Platform Voice Recorder
 * - Uses MediaRecorder.isTypeSupported (WebM/Opus on Chrome/Android, MP4/AAC on iOS Safari)
 * - Generates ~64-point waveform data in real-time using Web Audio AnalyserNode
 * - Records exact duration in metadata for accurate seeking
 * - Caps recording at 5 minutes (300 seconds)
 * - Stops cleanly when backgrounded (visibilitychange)
 * - Handles microphone permission denials gracefully
 */

export function getSupportedAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];

  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return 'audio/webm';
}

export interface VoiceRecordingResult {
  blob: Blob;
  durationSeconds: number;
  waveform: number[];
  mimeType: string;
}

export class AudioRecorderController {
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private timerInterval: NodeJS.Timeout | null = null;
  private sampledAmplitudes: number[] = [];
  private mimeType = '';
  private onVisibilityChangeHandler: (() => void) | null = null;

  public async startRecording(
    onTick?: (elapsedSeconds: number, currentAmp: number) => void
  ): Promise<void> {
    this.chunks = [];
    this.sampledAmplitudes = [];

    // Check secure context and mediaDevices availability (WebRTC browser requirement)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error('Voice note recording requires HTTPS or localhost. Modern browsers block microphone access on unencrypted HTTP.');
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support audio recording or blocked microphone access. HTTPS or localhost is required.');
    }

    // Request microphone stream
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission was denied. Please allow microphone access in your browser settings.');
      }
      throw new Error(`Microphone error: ${err.message || 'Unable to access audio device'}`);
    }

    // Set up Web Audio Analyser for live waveform generation
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (e) {
      console.warn('[AudioRecorder] Web Audio Analyser setup failed, continuing with fallback', e);
    }

    this.mimeType = getSupportedAudioMimeType();
    this.mediaRecorder = new MediaRecorder(this.audioStream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: 64000, // High quality voice compression
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(200); // 200ms timeslices for smooth capture
    this.startTime = Date.now();

    // Sample waveform every 80ms
    const pcmData = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 128);
    this.timerInterval = setInterval(() => {
      let amp = 0.05;
      if (this.analyser) {
        this.analyser.getByteFrequencyData(pcmData);
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i];
        }
        amp = Math.max(0.05, Math.min(1.0, (sum / pcmData.length) / 128));
      }
      this.sampledAmplitudes.push(amp);

      const elapsedSec = (Date.now() - this.startTime) / 1000;
      if (onTick) {
        onTick(elapsedSec, amp);
      }

      // 5-minute cap (300 seconds)
      if (elapsedSec >= 300) {
        this.stopRecording().catch(() => {});
      }
    }, 80);

    // Stop cleanly if app is backgrounded
    this.onVisibilityChangeHandler = () => {
      if (document.hidden && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.stopRecording().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChangeHandler);
  }

  public async stopRecording(): Promise<VoiceRecordingResult> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.onVisibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeHandler);
      this.onVisibilityChangeHandler = null;
    }

    const durationSeconds = Math.max(0.5, (Date.now() - this.startTime) / 1000);

    return new Promise<VoiceRecordingResult>((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder was not initialized'));
      }

      this.mediaRecorder.onstop = () => {
        try {
          const blob = new Blob(this.chunks, { type: this.mimeType });
          this.cleanup();

          // Resample/interpolate sampled amplitudes down to a clean 64-point normalized waveform
          const waveform = this.normalizeWaveform(this.sampledAmplitudes, 64);

          resolve({
            blob,
            durationSeconds: Math.round(durationSeconds * 10) / 10,
            waveform,
            mimeType: this.mimeType,
          });
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      } else {
        this.mediaRecorder.onstop?.(new Event('stop'));
      }
    });
  }

  public cancelRecording(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.onVisibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.onVisibilityChangeHandler);
      this.onVisibilityChangeHandler = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) {
        track.stop();
      }
      this.audioStream = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }

  /**
   * Resamples raw amplitude measurements to exactly targetPoints (e.g. 64)
   * with values bounded between 0.08 and 1.0.
   */
  private normalizeWaveform(raw: number[], targetPoints = 64): number[] {
    if (raw.length === 0) {
      return Array(targetPoints).fill(0.1);
    }
    const result: number[] = [];
    const step = raw.length / targetPoints;

    for (let i = 0; i < targetPoints; i++) {
      const idx = Math.min(Math.floor(i * step), raw.length - 1);
      const val = raw[idx];
      result.push(Math.round(Math.max(0.08, Math.min(1.0, val)) * 100) / 100);
    }

    return result;
  }
}
