import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { wsClient, WSCallIncomingEvent } from '../lib/wsClient';
import { useAuth } from './AuthContext';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallPartner {
  id: string;
  name: string;
  avatarTint?: number;
}

interface CallContextType {
  callState: CallState;
  callType: CallType;
  partner: CallPartner | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  duration: number;
  errorMessage: string | null;
  startCall: (partnerId: string, partnerName: string, partnerTint?: number, type?: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('voice');
  const [partner, setPartner] = useState<CallPartner | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const ringtoneOscRef = useRef<OscillatorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play calm synthetic ringtone via Web Audio API
  const startRingtone = useCallback((type: 'ring' | 'dial') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(type === 'dial' ? 440 : 523.25, ctx.currentTime);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      ringtoneOscRef.current = osc;
    } catch {
      // AudioContext may be restricted until user gesture
    }
  }, []);

  const stopRingtone = useCallback(() => {
    try {
      if (ringtoneOscRef.current) {
        ringtoneOscRef.current.stop();
        ringtoneOscRef.current.disconnect();
        ringtoneOscRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    } catch {}
  }, []);

  // Cleanup helper
  const cleanupCall = useCallback(() => {
    stopRingtone();

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setPartner(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setDuration(0);
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
  }, [stopRingtone]);

  // Duration timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      durationTimerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [callState]);

  // Setup PeerConnection
  const createPeerConnection = useCallback((targetUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsClient.sendCallIceCandidate({
          targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        stopRingtone();
        setCallState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        cleanupCall();
      }
    };

    return pc;
  }, [cleanupCall, stopRingtone]);

  // Start outgoing call
  const startCall = useCallback(async (
    partnerId: string,
    partnerName: string,
    partnerTint: number = 0,
    type: CallType = 'voice'
  ) => {
    cleanupCall();
    setErrorMessage(null);
    setPartner({ id: partnerId, name: partnerName, avatarTint: partnerTint });
    setCallType(type);
    setCallState('calling');
    startRingtone('dial');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(partnerId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsClient.sendCallInitiate({
        receiverId: partnerId,
        callerName: user?.displayName || user?.username || 'Contact',
        callerAvatarTint: user?.avatarTint ?? 0,
        callType: type,
        offer,
      });
    } catch (err) {
      console.error('[Call] Failed to acquire media or create offer', err);
      setErrorMessage('Could not access microphone/camera');
      cleanupCall();
    }
  }, [cleanupCall, createPeerConnection, startRingtone, user]);

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!partner || !incomingOfferRef.current) return;
    stopRingtone();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection(partner.id);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOfferRef.current));

      // Process queued candidates
      while (pendingCandidatesRef.current.length > 0) {
        const candidate = pendingCandidatesRef.current.shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsClient.sendCallAccept({
        callerId: partner.id,
        answer,
      });

      setCallState('connected');
    } catch (err) {
      console.error('[Call] Failed to accept call', err);
      setErrorMessage('Could not connect call');
      cleanupCall();
    }
  }, [callType, cleanupCall, createPeerConnection, partner, stopRingtone]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (partner) {
      wsClient.sendCallReject({ callerId: partner.id, reason: 'declined' });
    }
    cleanupCall();
  }, [cleanupCall, partner]);

  // End active call
  const endCall = useCallback(() => {
    if (partner) {
      wsClient.sendCallEnd({ targetUserId: partner.id });
    }
    cleanupCall();
  }, [cleanupCall, partner]);

  // Toggle mic mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Toggle video on/off
  const toggleVideo = useCallback(async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      } else {
        // Upgrade voice call to video
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
          });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          localStreamRef.current.addTrack(newVideoTrack);
          if (peerConnectionRef.current) {
            peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
          }
          setCallType('video');
          setIsVideoOff(false);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } catch {
          console.warn('[Call] Could not enable camera');
        }
      }
    }
  }, []);

  // Switch mobile camera (front/back)
  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current || callType !== 'video') return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
      });
      const newTrack = newStream.getVideoTracks()[0];

      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
      }
      localStreamRef.current.addTrack(newTrack);

      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack);
        }
      }

      setFacingMode(nextMode);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (e) {
      console.warn('[Call] Could not switch camera', e);
    }
  }, [callType, facingMode]);

  // Listen for WebSocket signaling events
  useEffect(() => {
    const unsubIncoming = wsClient.onCallIncoming(async (payload: WSCallIncomingEvent) => {
      incomingOfferRef.current = payload.offer;
      setPartner({
        id: payload.callerId,
        name: payload.callerName,
        avatarTint: payload.callerAvatarTint,
      });
      setCallType(payload.callType);
      setCallState('incoming');
      startRingtone('ring');
    });

    const unsubAccepted = wsClient.onCallAccepted(async (payload) => {
      stopRingtone();
      if (peerConnectionRef.current && payload.answer) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        setCallState('connected');
      }
    });

    const unsubRejected = wsClient.onCallRejected(() => {
      stopRingtone();
      setErrorMessage('Call was declined');
      setTimeout(() => cleanupCall(), 2000);
    });

    const unsubIce = wsClient.onCallIceCandidate(async (payload) => {
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.warn('[Call] Error adding ice candidate', e);
        }
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    });

    const unsubEnded = wsClient.onCallEnded(() => {
      cleanupCall();
    });

    const unsubOffline = wsClient.onCallUserOffline(() => {
      stopRingtone();
      setErrorMessage('User is currently offline');
      setTimeout(() => cleanupCall(), 2500);
    });

    return () => {
      unsubIncoming();
      unsubAccepted();
      unsubRejected();
      unsubIce();
      unsubEnded();
      unsubOffline();
    };
  }, [cleanupCall, startRingtone, stopRingtone]);

  return (
    <CallContext.Provider
      value={{
        callState,
        callType,
        partner,
        localStream,
        remoteStream,
        isMuted,
        isVideoOff,
        duration,
        errorMessage,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        switchCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextType {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
