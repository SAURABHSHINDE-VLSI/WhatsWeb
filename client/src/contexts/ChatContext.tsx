import React, { createContext, useContext, useEffect, useState, useCallback, useTransition } from 'react';
import { useAuth } from './AuthContext';
import {
  apiGetChats,
  apiGetMessages,
  apiUploadPreKeyBundle,
  apiFetchPreKeyBundle,
} from '../lib/api';
import {
  LocalMessage,
  LocalChat,
  saveMessagesToDB,
  getMessagesForPartner,
  updateMessageStatusInDB,
  saveChatsToDB,
  getChatsFromDB,
  addToOutbox,
  deleteMessageFromDB,
  updateMessageReactionInDB,
} from '../lib/db';
import {
  initCrypto,
  getOrCreateIdentityKey,
  getOrCreateSignedPreKey,
  generateOneTimePreKeys,
  getOrCreateSession,
  encryptMessage,
  decryptMessage,
  computeSafetyNumber,
  markSafetyNumberVerified,
  E2EEnvelope,
} from '../lib/crypto';
import { encryptAndUploadMedia } from '../lib/encryptedMedia';
import { wsClient, WSConnectionStatus } from '../lib/wsClient';

interface ChatContextValue {
  chats: LocalChat[];
  activeChat: LocalChat | null;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  messages: LocalMessage[];
  sendMessage: (
    content: string,
    type?: 'text' | 'photo' | 'voice',
    replyTo?: any,
    mediaUrl?: string
  ) => Promise<void>;
  sendMediaFile: (file: File) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, reaction: string) => Promise<void>;
  markAsRead: (partnerId: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
  isPartnerTyping: (partnerId: string) => boolean;
  isUserOnline: (userId: string) => boolean;
  getSafetyNumber: (partnerId: string) => Promise<string>;
  verifySafetyNumber: (partnerId: string, safetyNum: string) => Promise<void>;
  safetyNumberWarning: boolean;
  acknowledgeSafetyNumber: (partnerId: string) => Promise<void>;
  wsStatus: WSConnectionStatus;
  refreshChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [onlineSet, setOnlineSet] = useState<Set<string>>(new Set());
  const [safetyNumberWarning, setSafetyNumberWarning] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<WSConnectionStatus>('disconnected');
  const [, startTransition] = useTransition();

  // 1. Initialize E2EE Keys on mount & publish bundle to server
  useEffect(() => {
    if (!user) return;

    async function initE2EE() {
      try {
        await initCrypto();
        const identity = await getOrCreateIdentityKey();
        const spk = await getOrCreateSignedPreKey(identity);
        const opks = await generateOneTimePreKeys(20);

        await apiUploadPreKeyBundle({
          identityKey: identity.dhPublicKey,
          identitySignKey: identity.signPublicKey,
          signedPreKey: spk.publicKey,
          signedPreKeySignature: spk.signature,
          oneTimePreKeys: opks.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicKey,
          })),
        });
        console.log('[E2EE] Identity & Pre-keys published for user:', user?.username);
      } catch (err) {
        console.warn('[E2EE] Key setup error', err);
      }
    }

    initE2EE();
  }, [user]);

  // 2. Listen to WebSocket connection status
  useEffect(() => {
    const unsub = wsClient.onStatusChange((status) => {
      setWsStatus(status);
    });
    return () => {
      unsub();
    };
  }, []);

  // 3. Fetch chats from IndexedDB first (optimistic), then update from API
  const refreshChats = useCallback(async () => {
    if (!user) return;

    const cachedChats = await getChatsFromDB();
    if (cachedChats.length > 0) {
      setChats(cachedChats);
    }

    try {
      const res = await apiGetChats();
      if (res?.chats) {
        const formatted: LocalChat[] = res.chats.map((c: any) => ({
          id: c.id,
          name: c.name,
          username: c.username,
          avatarUrl: c.avatarUrl,
          tint: c.tint,
          snippet: c.lastMessage ? c.lastMessage.content : 'No messages yet',
          lastMessageTime: c.lastMessage
            ? new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
          unreadCount: c.unreadCount || 0,
          isPinned: c.isPinned || false,
          isMuted: c.isMuted || false,
          isOnline: onlineSet.has(c.id),
        }));

        setChats(formatted);
        await saveChatsToDB(formatted);
      }
    } catch (err) {
      console.warn('[ChatContext] Network error fetching chats, using local cache', err);
    }
  }, [user, onlineSet]);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  // 4. Load messages when activeChatId changes (Zero re-decryption on stored history)
  useEffect(() => {
    if (!activeChatId || !user) {
      setMessages([]);
      return;
    }

    let isCurrent = true;

    async function loadChatMessages() {
      // 1. Instant load from IndexedDB (already decrypted and safely stored)
      const localMsgs = await getMessagesForPartner(activeChatId!);
      if (isCurrent && localMsgs.length > 0) {
        setMessages(localMsgs);
      }

      // Check session safety number warning state
      const { session } = await getOrCreateSession(activeChatId!).catch(() => ({ session: null as any }));
      if (session?.safetyNumberChanged && !session?.verifiedSafetyNumber) {
        setSafetyNumberWarning(true);
      } else {
        setSafetyNumberWarning(false);
      }

      // 2. Fetch latest messages from API and only decrypt NEW messages
      try {
        const res = await apiGetMessages(activeChatId!);
        if (isCurrent && res?.messages) {
          const localMap = new Map(localMsgs.map((m) => [m.id, m]));
          const toSave: LocalMessage[] = [];
          const combinedList: LocalMessage[] = [];

          for (const m of res.messages) {
            // If already decrypted and stored locally, reuse local plaintext!
            if (localMap.has(m.id)) {
              combinedList.push(localMap.get(m.id)!);
              continue;
            }

            let plainContent = m.content;
            if (m.nonce && m.nonce !== 'none') {
              try {
                const envelope: E2EEnvelope = m.envelope
                  ? (typeof m.envelope === 'string' ? JSON.parse(m.envelope) : m.envelope)
                  : {
                      version: 1,
                      type: m.ephemeralKey ? 'prekey' : 'whisper',
                      senderIdentityKey: m.ephemeralKey || '',
                      ephemeralKey: m.ephemeralKey,
                      oneTimePreKeyId: m.recipientPreKeyId,
                      dhPublicKey: m.dhPublicKey || m.ephemeralKey || '',
                      sequence: m.sequence || 0,
                      previousChainLength: 0,
                      ciphertext: m.content,
                      nonce: m.nonce,
                    };

                plainContent = await decryptMessage(activeChatId!, envelope);
              } catch (e) {
                console.warn('[E2EE] Decryption failure for message', m.id, e);
                plainContent = '[Could not decrypt message — ask contact to resend]';
              }
            }

            const item: LocalMessage = {
              id: m.id,
              clientMessageId: m.clientMessageId || m.id,
              senderId: m.senderId,
              receiverId: m.receiverId,
              partnerId: activeChatId!,
              content: plainContent,
              type: m.type,
              mediaUrl: m.mediaUrl,
              status: m.status,
              replyToId: m.replyToId,
              createdAt: m.createdAt,
              isSent: m.senderId === user!.id,
            };

            toSave.push(item);
            combinedList.push(item);
          }

          if (toSave.length > 0) {
            await saveMessagesToDB(toSave);
          }

          if (isCurrent) {
            setMessages(combinedList);
          }
        }
      } catch (err) {
        console.warn('[ChatContext] Network error fetching chat history', err);
      }
    }

    loadChatMessages();

    return () => {
      isCurrent = false;
    };
  }, [activeChatId, user]);

  // 5. Setup WebSocket event subscriptions
  useEffect(() => {
    if (!user) return;

    const unsubMsg = wsClient.onMessage(async (newMsg) => {
      const isForActiveChat = activeChatId && (newMsg.senderId === activeChatId || newMsg.receiverId === activeChatId);
      const partnerId = newMsg.senderId === user.id ? newMsg.receiverId : newMsg.senderId;

      let decryptedContent = '';

      // E2EE Decryption using Double Ratchet
      if (newMsg.content && newMsg.nonce && newMsg.nonce !== 'none') {
        try {
          const envelope: E2EEnvelope = newMsg.envelope
            ? (typeof newMsg.envelope === 'string' ? JSON.parse(newMsg.envelope) : newMsg.envelope)
            : {
                version: 1,
                type: newMsg.ephemeralKey ? 'prekey' : 'whisper',
                senderIdentityKey: newMsg.ephemeralKey || '',
                ephemeralKey: newMsg.ephemeralKey,
                oneTimePreKeyId: newMsg.recipientPreKeyId,
                dhPublicKey: newMsg.dhPublicKey || newMsg.ephemeralKey || '',
                sequence: newMsg.sequence || 0,
                previousChainLength: 0,
                ciphertext: newMsg.ciphertext || newMsg.content,
                nonce: newMsg.nonce,
              };

          decryptedContent = await decryptMessage(partnerId, envelope);
        } catch (e) {
          console.warn('[E2EE] Decryption failed for incoming message', e);
          decryptedContent = '[Could not decrypt message — ask contact to resend]';
        }
      } else {
        decryptedContent = newMsg.content || '';
      }

      const localMsg: LocalMessage = {
        id: newMsg.id,
        clientMessageId: newMsg.clientMessageId || newMsg.id,
        senderId: newMsg.senderId,
        receiverId: newMsg.receiverId,
        partnerId,
        content: decryptedContent,
        type: newMsg.type as any,
        mediaUrl: newMsg.mediaUrl,
        status: newMsg.status as any,
        replyToId: newMsg.replyToId,
        createdAt: newMsg.createdAt,
        isSent: newMsg.senderId === user.id,
      };

      await saveMessagesToDB([localMsg]);

      if (isForActiveChat) {
        startTransition(() => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === localMsg.id)) return prev;
            return [...prev, localMsg];
          });
        });
        wsClient.sendReadReceipt(newMsg.senderId, [newMsg.id]);
      }

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === partnerId) {
            return {
              ...c,
              snippet: localMsg.content,
              lastMessageTime: new Date(localMsg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              unreadCount: isForActiveChat ? 0 : c.unreadCount + 1,
            };
          }
          return c;
        })
      );
    });

    const unsubAck = wsClient.onAck(async (ack) => {
      await updateMessageStatusInDB(ack.messageId, ack.clientMessageId, ack.status);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.clientMessageId === ack.clientMessageId || m.id === ack.messageId) {
            return { ...m, id: ack.messageId, status: ack.status };
          }
          return m;
        })
      );
    });

    const unsubRead = wsClient.onReadReceipt(async (receipt) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (receipt.messageIds.includes(m.id)) {
            return { ...m, status: 'read' };
          }
          return m;
        })
      );
    });

    const unsubTyping = wsClient.onTyping((typingEvent) => {
      setTypingMap((prev) => ({
        ...prev,
        [typingEvent.senderId]: typingEvent.isTyping,
      }));
    });

    const unsubPresence = wsClient.onPresence((presence) => {
      setOnlineSet((prev) => {
        const next = new Set(prev);
        if (presence.isOnline) {
          next.add(presence.userId);
        } else {
          next.delete(presence.userId);
        }
        return next;
      });
      setChats((prev) =>
        prev.map((c) => (c.id === presence.userId ? { ...c, isOnline: presence.isOnline } : c))
      );
    });

    return () => {
      unsubMsg();
      unsubAck();
      unsubRead();
      unsubTyping();
      unsubPresence();
    };
  }, [user, activeChatId]);

  // 6. E2EE Send message action: Strictly Fail-Closed, Zero Plaintext Fallback
  const sendMessage = useCallback(
    async (
      content: string,
      type: 'text' | 'photo' | 'voice' = 'text',
      replyTo?: any,
      mediaUrl?: string
    ) => {
      if (!user || !activeChatId || !content.trim()) return;

      const clientMessageId = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const now = new Date().toISOString();

      // Establish or fetch session
      let { session, initialEnvelopeParams } = await getOrCreateSession(activeChatId).catch(() => ({
        session: null as any,
        initialEnvelopeParams: undefined,
      }));

      if (!session) {
        // Fetch recipient's pre-key bundle and verify signature
        const bundle = await apiFetchPreKeyBundle(activeChatId);
        const result = await getOrCreateSession(activeChatId, bundle);
        session = result.session;
        initialEnvelopeParams = result.initialEnvelopeParams;
      }

      // Check safety number changed alert
      if (session.safetyNumberChanged && !session.verifiedSafetyNumber) {
        setSafetyNumberWarning(true);
        throw new Error('Safety number has changed for this contact. Sending is blocked until acknowledged.');
      }

      // Encrypt strictly using Double Ratchet (Throws if encryption fails - NO PLAINTEXT FALLBACK)
      const envelope = await encryptMessage(activeChatId, content.trim(), initialEnvelopeParams);

      // Optimistic local UI insertion with decrypted content
      const optimisticMsg: LocalMessage = {
        id: clientMessageId,
        clientMessageId,
        senderId: user.id,
        receiverId: activeChatId,
        partnerId: activeChatId,
        content: content.trim(),
        type,
        mediaUrl,
        status: 'pending',
        replyQuote: replyTo
          ? {
              name: replyTo.name || replyTo.author,
              snippet: replyTo.snippet || replyTo.text,
            }
          : undefined,
        createdAt: now,
        isSent: true,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      await saveMessagesToDB([optimisticMsg]);

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? {
                ...c,
                snippet: type === 'photo' ? 'Photo' : type === 'voice' ? 'Voice note' : content.trim(),
                lastMessageTime: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }
            : c
        )
      );

      // Transmit strictly ciphertext envelope over WebSocket
      const sent = wsClient.sendMessage({
        clientMessageId,
        receiverId: activeChatId,
        content: envelope.ciphertext,
        nonce: envelope.nonce,
        ephemeralKey: envelope.ephemeralKey,
        recipientPreKeyId: envelope.oneTimePreKeyId,
        dhPublicKey: envelope.dhPublicKey,
        sequence: envelope.sequence,
        envelope,
        type,
        mediaUrl,
      });

      if (!sent) {
        console.log('[ChatContext] Network offline, adding message to encrypted outbox queue');
        await addToOutbox({
          id: clientMessageId,
          receiverId: activeChatId,
          content: envelope.ciphertext,
          type,
          createdAt: now,
          attempts: 0,
        });
      }
    },
    [user, activeChatId]
  );

  const sendMediaFile = useCallback(
    async (file: File) => {
      if (!user || !activeChatId) return;
      try {
        const metadata = await encryptAndUploadMedia(file);
        // Send E2EE message carrying encrypted media metadata inside ciphertext
        await sendMessage(
          JSON.stringify({
            caption: file.name || 'Attachment',
            mediaUrl: metadata.mediaUrl,
            key: metadata.key,
            header: metadata.header,
            mimeType: metadata.mimeType,
            fileSize: metadata.fileSize,
          }),
          file.type.startsWith('audio/') ? 'voice' : 'photo',
          undefined,
          metadata.mediaUrl
        );
      } catch (err: any) {
        console.error('[ChatContext] Failed to encrypt/upload media', err);
        alert(err.message || 'Media upload and encryption failed');
      }
    },
    [user, activeChatId, sendMessage]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId && m.clientMessageId !== messageId));
      await deleteMessageFromDB(messageId);
    },
    []
  );

  const reactToMessage = useCallback(
    async (messageId: string, reaction: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId || m.clientMessageId === messageId) {
            const nextReaction = m.reaction === reaction ? undefined : reaction;
            return { ...m, reaction: nextReaction };
          }
          return m;
        })
      );
      await updateMessageReactionInDB(messageId, reaction);
    },
    []
  );

  const markAsRead = useCallback(
    async (partnerId: string) => {
      if (!user) return;
      wsClient.sendReadReceipt(partnerId);
      setChats((prev) =>
        prev.map((c) => (c.id === partnerId ? { ...c, unreadCount: 0 } : c))
      );
    },
    [user]
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (activeChatId) {
        wsClient.sendTyping(activeChatId, isTyping);
      }
    },
    [activeChatId]
  );

  const isPartnerTyping = useCallback(
    (partnerId: string) => Boolean(typingMap[partnerId]),
    [typingMap]
  );

  const isUserOnline = useCallback(
    (userId: string) => onlineSet.has(userId),
    [onlineSet]
  );

  const getSafetyNumber = useCallback(
    async (partnerId: string) => {
      const myIdentity = await getOrCreateIdentityKey();
      let bundle = await apiFetchPreKeyBundle(partnerId).catch(() => null);
      const theirIdentity = bundle?.identityKey || myIdentity.dhPublicKey;
      return computeSafetyNumber(myIdentity.dhPublicKey, theirIdentity);
    },
    []
  );

  const verifySafetyNumber = useCallback(
    async (partnerId: string, safetyNum: string) => {
      await markSafetyNumberVerified(partnerId, safetyNum);
      setSafetyNumberWarning(false);
    },
    []
  );

  const acknowledgeSafetyNumber = useCallback(
    async (partnerId: string) => {
      const myIdentity = await getOrCreateIdentityKey();
      let bundle = await apiFetchPreKeyBundle(partnerId).catch(() => null);
      const theirIdentity = bundle?.identityKey || myIdentity.dhPublicKey;
      const num = await computeSafetyNumber(myIdentity.dhPublicKey, theirIdentity);
      await markSafetyNumberVerified(partnerId, num);
      setSafetyNumberWarning(false);
    },
    []
  );

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChat,
        activeChatId,
        setActiveChatId,
        messages,
        sendMessage,
        sendMediaFile,
        deleteMessage,
        reactToMessage,
        markAsRead,
        sendTyping,
        isPartnerTyping,
        isUserOnline,
        getSafetyNumber,
        verifySafetyNumber,
        safetyNumberWarning,
        acknowledgeSafetyNumber,
        wsStatus,
        refreshChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
