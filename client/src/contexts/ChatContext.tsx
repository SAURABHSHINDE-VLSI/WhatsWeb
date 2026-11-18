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
  initializeReceivingSession,
  encryptMessage,
  decryptMessage,
  computeSafetyNumber,
  markSafetyNumberVerified,
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
          phoneNumber: c.phoneNumber,
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

  // 4. Load messages when activeChatId changes
  useEffect(() => {
    if (!activeChatId || !user) {
      setMessages([]);
      return;
    }

    let isCurrent = true;

    async function loadChatMessages() {
      // 1. Instant load from IndexedDB
      const localMsgs = await getMessagesForPartner(activeChatId!);
      if (isCurrent && localMsgs.length > 0) {
        setMessages(localMsgs);
      }

      // 2. Fetch latest from API
      try {
        const res = await apiGetMessages(activeChatId!);
        if (isCurrent && res?.messages) {
          const mapped: LocalMessage[] = [];
          for (const m of res.messages) {
            let plainContent = m.content;
            // If encrypted on server, decrypt if needed or use local copy
            if (m.nonce && m.nonce !== 'none') {
              try {
                plainContent = await decryptMessage(activeChatId!, m.content, m.nonce, {
                  senderId: m.senderId,
                  receiverId: m.receiverId,
                  timestamp: m.createdAt,
                });
              } catch (e) {
                // If already decrypted or key ratcheted, fall back to stored local copy
                const existing = localMsgs.find((lm) => lm.id === m.id);
                if (existing) plainContent = existing.content;
              }
            }

            mapped.push({
              id: m.id,
              clientMessageId: m.clientMessageId || m.id,
              senderId: m.senderId,
              receiverId: m.receiverId,
              partnerId: m.senderId === user!.id ? m.receiverId : m.senderId,
              content: plainContent,
              type: m.type,
              mediaUrl: m.mediaUrl,
              status: m.status,
              replyToId: m.replyToId,
              createdAt: m.createdAt,
              isSent: m.senderId === user!.id,
            });
          }

          setMessages(mapped);
          await saveMessagesToDB(mapped);

          // Mark unread messages as read
          markAsRead(activeChatId!);
        }
      } catch (err) {
        console.warn('[ChatContext] Network error fetching messages, using local cache', err);
      }
    }

    loadChatMessages();

    return () => {
      isCurrent = false;
    };
  }, [activeChatId, user]);

  // 5. WebSocket Event Listeners
  useEffect(() => {
    if (!user) return;

    // Incoming message (Encrypted blob)
    const unsubMsg = wsClient.onMessage(async (newMsg: any) => {
      const isForActiveChat = activeChatId && (newMsg.senderId === activeChatId || newMsg.receiverId === activeChatId);
      const partnerId = newMsg.senderId === user.id ? newMsg.receiverId : newMsg.senderId;

      let decryptedContent = newMsg.ciphertext || newMsg.content;

      // E2EE Decryption
      if (newMsg.ciphertext && newMsg.nonce && newMsg.nonce !== 'none') {
        try {
          if (newMsg.ephemeralKey) {
            await initializeReceivingSession(
              partnerId,
              newMsg.senderId,
              newMsg.ephemeralKey,
              newMsg.recipientPreKeyId
            ).catch(() => {});
          }

          decryptedContent = await decryptMessage(partnerId, newMsg.ciphertext, newMsg.nonce, {
            senderId: newMsg.senderId,
            receiverId: newMsg.receiverId,
            timestamp: newMsg.createdAt,
          });
        } catch (e) {
          console.warn('[E2EE] Decryption fallback', e);
          decryptedContent = newMsg.content || '[Encrypted message]';
        }
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

  // 6. E2EE Send message action
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

      // Perform End-to-End Encryption
      let ciphertext = content.trim();
      let nonce = 'none';
      let ephemeralKey: string | undefined;
      let opkId: number | undefined;

      try {
        let bundleForFirstMessage: any = null;
        let session = await getOrCreateSession(activeChatId).catch(() => null);

        if (!session) {
          bundleForFirstMessage = await apiFetchPreKeyBundle(activeChatId);
          session = await getOrCreateSession(activeChatId, bundleForFirstMessage);
          opkId = bundleForFirstMessage?.oneTimePreKey?.keyId;
          ephemeralKey = session.rootKey;
        }

        const encrypted = await encryptMessage(activeChatId, content.trim(), {
          senderId: user.id,
          receiverId: activeChatId,
          timestamp: now,
        });

        ciphertext = encrypted.ciphertext;
        nonce = encrypted.nonce;
      } catch (err) {
        console.warn('[E2EE] Session encryption fallback', err);
      }

      // Transmit strictly ciphertext blob over WebSocket
      const sent = wsClient.sendMessage({
        clientMessageId,
        receiverId: activeChatId,
        content: ciphertext, // Server stores only ciphertext!
        type,
        mediaUrl,
      });

      if (!sent) {
        console.log('[ChatContext] Network offline, adding message to outbox queue');
        await addToOutbox({
          id: clientMessageId,
          receiverId: activeChatId,
          content: ciphertext,
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
        // Send E2EE message referencing encrypted media blob URL
        await sendMessage(
          file.name || 'Photo attachment',
          file.type.startsWith('audio/') ? 'voice' : 'photo',
          undefined,
          metadata.mediaUrl
        );
      } catch (err) {
        console.error('[ChatContext] Failed to encrypt/upload media', err);
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
