import { WS_BASE, getAccessToken, apiGetWsTicket } from './api';
import { getOutboxItems, removeFromOutbox } from './db';

export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WSMessageNewEvent {
  id: string;
  clientMessageId?: string;
  senderId: string;
  receiverId: string;
  content: string;
  ciphertext?: string;
  nonce?: string;
  ephemeralKey?: string;
  recipientPreKeyId?: number | null;
  dhPublicKey?: string;
  sequence?: number;
  envelope?: any;
  type: string;
  mediaUrl?: string;
  status: string;
  replyToId?: string;
  createdAt: string;
}

export interface WSMessageAckEvent {
  clientMessageId: string;
  messageId: string;
  status: 'sent' | 'delivered';
  createdAt: string;
}

export interface WSReadReceiptEvent {
  readByUserId: string;
  messageIds: string[];
  readAt: string;
}

export interface WSTypingEvent {
  senderId: string;
  isTyping: boolean;
}

export interface WSPresenceEvent {
  userId: string;
  isOnline: boolean;
  lastSeen: string;
}

export interface WSCallIncomingEvent {
  callerId: string;
  callerName: string;
  callerAvatarTint: number;
  callType: 'voice' | 'video';
  offer: RTCSessionDescriptionInit;
}

export interface WSCallAcceptedEvent {
  receiverId: string;
  answer: RTCSessionDescriptionInit;
}

export interface WSCallRejectedEvent {
  receiverId: string;
  reason: string;
}

export interface WSCallIceCandidateEvent {
  senderId: string;
  candidate: RTCIceCandidateInit;
}

export interface WSCallEndedEvent {
  senderId: string;
}

export interface WSCallUserOfflineEvent {
  receiverId: string;
}

type EventHandler<T> = (data: T) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private status: WSConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private explicitDisconnect = false;

  // Listeners
  private statusListeners = new Set<(status: WSConnectionStatus) => void>();
  private messageListeners = new Set<EventHandler<WSMessageNewEvent>>();
  private ackListeners = new Set<EventHandler<WSMessageAckEvent>>();
  private readReceiptListeners = new Set<EventHandler<WSReadReceiptEvent>>();
  private typingListeners = new Set<EventHandler<WSTypingEvent>>();
  private presenceListeners = new Set<EventHandler<WSPresenceEvent>>();
  private callIncomingListeners = new Set<EventHandler<WSCallIncomingEvent>>();
  private callAcceptedListeners = new Set<EventHandler<WSCallAcceptedEvent>>();
  private callRejectedListeners = new Set<EventHandler<WSCallRejectedEvent>>();
  private callIceCandidateListeners = new Set<EventHandler<WSCallIceCandidateEvent>>();
  private callEndedListeners = new Set<EventHandler<WSCallEndedEvent>>();
  private callUserOfflineListeners = new Set<EventHandler<WSCallUserOfflineEvent>>();

  public getStatus(): WSConnectionStatus {
    return this.status;
  }

  public onStatusChange(fn: (status: WSConnectionStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  public onMessage(fn: EventHandler<WSMessageNewEvent>) {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  public onAck(fn: EventHandler<WSMessageAckEvent>) {
    this.ackListeners.add(fn);
    return () => this.ackListeners.delete(fn);
  }

  public onReadReceipt(fn: EventHandler<WSReadReceiptEvent>) {
    this.readReceiptListeners.add(fn);
    return () => this.readReceiptListeners.delete(fn);
  }

  public onTyping(fn: EventHandler<WSTypingEvent>) {
    this.typingListeners.add(fn);
    return () => this.typingListeners.delete(fn);
  }

  public onPresence(fn: EventHandler<WSPresenceEvent>) {
    this.presenceListeners.add(fn);
    return () => this.presenceListeners.delete(fn);
  }

  public onCallIncoming(fn: EventHandler<WSCallIncomingEvent>) {
    this.callIncomingListeners.add(fn);
    return () => this.callIncomingListeners.delete(fn);
  }

  public onCallAccepted(fn: EventHandler<WSCallAcceptedEvent>) {
    this.callAcceptedListeners.add(fn);
    return () => this.callAcceptedListeners.delete(fn);
  }

  public onCallRejected(fn: EventHandler<WSCallRejectedEvent>) {
    this.callRejectedListeners.add(fn);
    return () => this.callRejectedListeners.delete(fn);
  }

  public onCallIceCandidate(fn: EventHandler<WSCallIceCandidateEvent>) {
    this.callIceCandidateListeners.add(fn);
    return () => this.callIceCandidateListeners.delete(fn);
  }

  public onCallEnded(fn: EventHandler<WSCallEndedEvent>) {
    this.callEndedListeners.add(fn);
    return () => this.callEndedListeners.delete(fn);
  }

  public onCallUserOffline(fn: EventHandler<WSCallUserOfflineEvent>) {
    this.callUserOfflineListeners.add(fn);
    return () => this.callUserOfflineListeners.delete(fn);
  }

  private setStatus(newStatus: WSConnectionStatus) {
    this.status = newStatus;
    for (const fn of this.statusListeners) {
      fn(newStatus);
    }
  }

  public async connect() {
    const token = getAccessToken();
    if (!token) {
      console.warn('[WS] Cannot connect: no access token');
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitDisconnect = false;
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      // Exchange session token for single-use 60s ticket (never passes JWT in URL query string)
      const ticket = await apiGetWsTicket();
      const url = `${WS_BASE}?ticket=${encodeURIComponent(ticket)}`;
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log('[WS] Connected successfully');
        this.setStatus('connected');
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        this.flushOutbox();
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleIncomingPayload(payload);
        } catch (e) {
          console.error('[WS] Failed to parse message', e);
        }
      };

      this.socket.onclose = () => {
        console.log('[WS] Connection closed');
        this.stopHeartbeat();
        this.socket = null;
        if (!this.explicitDisconnect) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[WS] Socket error', err);
      };
    } catch (err) {
      console.error('[WS] Connection exception', err);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.explicitDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('disconnected');
  }

  private scheduleReconnect() {
    if (this.explicitDisconnect || this.reconnectTimer) return;

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;

    console.log(`[WS] Reconnecting in ${delay}ms (attempt #${this.reconnectAttempt})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ event: 'ping' }));
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleIncomingPayload(payload: any) {
    const { event } = payload;
    if (event === 'message:new') {
      for (const fn of this.messageListeners) fn(payload.message);
    } else if (event === 'message:ack') {
      for (const fn of this.ackListeners) fn(payload);
    } else if (event === 'message:read_receipt') {
      for (const fn of this.readReceiptListeners) fn(payload);
    } else if (event === 'typing') {
      for (const fn of this.typingListeners) fn(payload);
    } else if (event === 'presence') {
      for (const fn of this.presenceListeners) fn(payload);
    } else if (event === 'call:incoming') {
      for (const fn of this.callIncomingListeners) fn(payload);
    } else if (event === 'call:accepted') {
      for (const fn of this.callAcceptedListeners) fn(payload);
    } else if (event === 'call:rejected') {
      for (const fn of this.callRejectedListeners) fn(payload);
    } else if (event === 'call:ice_candidate') {
      for (const fn of this.callIceCandidateListeners) fn(payload);
    } else if (event === 'call:ended') {
      for (const fn of this.callEndedListeners) fn(payload);
    } else if (event === 'call:user_offline') {
      for (const fn of this.callUserOfflineListeners) fn(payload);
    }
  }

  public sendMessage(data: {
    clientMessageId: string;
    receiverId: string;
    content: string;
    nonce: string;
    ephemeralKey?: string;
    recipientPreKeyId?: number | null;
    dhPublicKey?: string;
    sequence?: number;
    envelope?: any;
    type?: string;
    mediaUrl?: string;
    replyToId?: string;
  }): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          event: 'message:send',
          data,
        })
      );
      return true;
    }
    return false;
  }

  public sendReadReceipt(partnerId: string, messageIds?: string[]) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          event: 'message:read',
          data: { partnerId, messageIds },
        })
      );
    }
  }

  public sendTyping(receiverId: string, isTyping: boolean) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          event: 'typing',
          data: { receiverId, isTyping },
        })
      );
    }
  }

  public sendCallInitiate(data: {
    receiverId: string;
    callerName: string;
    callerAvatarTint: number;
    callType: 'voice' | 'video';
    offer: RTCSessionDescriptionInit;
  }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'call:initiate', data }));
    }
  }

  public sendCallAccept(data: { callerId: string; answer: RTCSessionDescriptionInit }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'call:accept', data }));
    }
  }

  public sendCallReject(data: { callerId: string; reason?: string }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'call:reject', data }));
    }
  }

  public sendCallIceCandidate(data: { targetUserId: string; candidate: RTCIceCandidateInit }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'call:ice_candidate', data }));
    }
  }

  public sendCallEnd(data: { targetUserId: string }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event: 'call:end', data }));
    }
  }

  /**
   * Automatic retry: Flushes queued messages from IndexedDB on reconnect
   */
  public async flushOutbox() {
    try {
      const items = await getOutboxItems();
      if (items.length === 0) return;

      console.log(`[WS] Flushing ${items.length} queued messages from outbox...`);
      for (const item of items) {
        const sent = this.sendMessage({
          clientMessageId: item.id,
          receiverId: item.receiverId,
          content: item.content,
          nonce: 'none',
          type: item.type,
          replyToId: item.replyToId,
        });
        if (sent) {
          await removeFromOutbox(item.id);
        }
      }
    } catch (e) {
      console.error('[WS] Error flushing outbox', e);
    }
  }
}

export const wsClient = new WebSocketClient();
