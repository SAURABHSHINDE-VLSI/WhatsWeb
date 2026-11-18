import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface LocalMessage {
  id: string; // server ID or clientMessageId
  clientMessageId: string;
  senderId: string;
  receiverId: string;
  partnerId: string; // convenient index
  content: string;
  type: 'text' | 'photo' | 'voice' | 'sent' | 'received';
  mediaUrl?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  replyToId?: string;
  replyQuote?: {
    name?: string;
    author?: string;
    snippet?: string;
    text?: string;
  };
  reaction?: string;
  createdAt: string;
  isSent: boolean;
}

export interface LocalChat {
  id: string; // partnerId
  name: string;
  username: string;
  avatarUrl?: string | null;
  tint: number;
  snippet: string;
  lastMessageTime: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isOnline?: boolean;
  hasVoice?: boolean;
  hasPhoto?: boolean;
}

export interface OutboxItem {
  id: string; // clientMessageId
  receiverId: string;
  content: string;
  nonce?: string;
  envelope?: any;
  type: string;
  mediaUrl?: string;
  replyToId?: string;
  createdAt: string;
  attempts: number;
}

interface EditorialChatDB extends DBSchema {
  messages: {
    key: string;
    value: LocalMessage;
    indexes: {
      'by-partner': string;
      'by-created': string;
      'by-status': string;
    };
  };
  chats: {
    key: string;
    value: LocalChat;
  };
  outbox: {
    key: string;
    value: OutboxItem;
  };
  kv: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<EditorialChatDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<EditorialChatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<EditorialChatDB>('editorial_messenger_v1', 1, {
      upgrade(db) {
        // Messages store
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-partner', 'partnerId');
        msgStore.createIndex('by-created', 'createdAt');
        msgStore.createIndex('by-status', 'status');

        // Chats store
        db.createObjectStore('chats', { keyPath: 'id' });

        // Offline Outbox store
        db.createObjectStore('outbox', { keyPath: 'id' });

        // Simple Key-Value store
        db.createObjectStore('kv');
      },
    });
  }
  return dbPromise;
}

// Helper DB functions
export async function saveMessagesToDB(messages: LocalMessage[]) {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
}

export async function getMessagesForPartner(partnerId: string): Promise<LocalMessage[]> {
  const db = await getDB();
  const messages = await db.getAllFromIndex('messages', 'by-partner', partnerId);
  return messages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function updateMessageStatusInDB(
  messageId: string,
  clientMessageId: string | undefined,
  status: 'sent' | 'delivered' | 'read'
) {
  const db = await getDB();
  let msg = await db.get('messages', messageId);
  if (!msg && clientMessageId) {
    msg = await db.get('messages', clientMessageId);
  }
  if (msg) {
    msg.status = status;
    if (messageId !== msg.id) {
      // replace temporary client ID with server ID if changed
      await db.delete('messages', msg.id);
      msg.id = messageId;
    }
    await db.put('messages', msg);
  }
}

export async function saveChatsToDB(chats: LocalChat[]) {
  const db = await getDB();
  const tx = db.transaction('chats', 'readwrite');
  for (const chat of chats) {
    await tx.store.put(chat);
  }
  await tx.done;
}

export async function getChatsFromDB(): Promise<LocalChat[]> {
  const db = await getDB();
  return db.getAll('chats');
}

export async function addToOutbox(item: OutboxItem) {
  const db = await getDB();
  await db.put('outbox', item);
}

export async function removeFromOutbox(id: string) {
  const db = await getDB();
  await db.delete('outbox', id);
}

export async function getOutboxItems(): Promise<OutboxItem[]> {
  const db = await getDB();
  return db.getAll('outbox');
}

export async function deleteMessageFromDB(id: string) {
  const db = await getDB();
  await db.delete('messages', id);
}

export async function updateMessageReactionInDB(id: string, reaction?: string) {
  const db = await getDB();
  const msg = await db.get('messages', id);
  if (msg) {
    msg.reaction = reaction;
    await db.put('messages', msg);
  }
}

export async function clearChatMessagesInDB(partnerId: string) {
  const db = await getDB();
  const messages = await db.getAllFromIndex('messages', 'by-partner', partnerId);
  const tx = db.transaction('messages', 'readwrite');
  for (const m of messages) {
    await tx.store.delete(m.id);
  }
  await tx.done;
}
