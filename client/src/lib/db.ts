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
      'by-partner-created': [string, string];
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
    dbPromise = openDB<EditorialChatDB>('editorial_messenger_v1', 2, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        let msgStore;
        if (oldVersion < 1) {
          msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-partner', 'partnerId');
          msgStore.createIndex('by-created', 'createdAt');
          msgStore.createIndex('by-status', 'status');

          db.createObjectStore('chats', { keyPath: 'id' });
          db.createObjectStore('outbox', { keyPath: 'id' });
          db.createObjectStore('kv');
        } else {
          msgStore = transaction.objectStore('messages');
        }

        if (oldVersion < 2) {
          if (!msgStore.indexNames.contains('by-partner-created')) {
            msgStore.createIndex('by-partner-created', ['partnerId', 'createdAt']);
          }
        }
      },
    });
  }
  return dbPromise;
}

// 1. Batch writes to IndexedDB
export async function saveMessagesToDB(messages: LocalMessage[]) {
  if (messages.length === 0) return;
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
}

// 2. Fetch all messages for partner (sorted by createdAt)
export async function getMessagesForPartner(partnerId: string): Promise<LocalMessage[]> {
  const db = await getDB();
  const messages = await db.getAllFromIndex('messages', 'by-partner', partnerId);
  return messages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// 3. Paginated messages query: fast sub-millisecond cursor reading
export async function getMessagesForPartnerPaged(
  partnerId: string,
  limit = 50,
  beforeCreatedAt?: string
): Promise<{ messages: LocalMessage[]; hasMore: boolean }> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readonly');

  try {
    const index = tx.store.index('by-partner-created');
    const upper = beforeCreatedAt || '\uffff';
    const range = IDBKeyRange.bound([partnerId, ''], [partnerId, upper], false, Boolean(beforeCreatedAt));

    let cursor = await index.openCursor(range, 'prev');
    const results: LocalMessage[] = [];

    while (cursor && results.length < limit) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }

    const hasMore = Boolean(cursor);
    results.reverse(); // Chronological order
    return { messages: results, hasMore };
  } catch (err) {
    // Fallback if compound index was not ready
    const all = await getMessagesForPartner(partnerId);
    let filtered = all;
    if (beforeCreatedAt) {
      const beforeTime = new Date(beforeCreatedAt).getTime();
      filtered = all.filter((m) => new Date(m.createdAt).getTime() < beforeTime);
    }
    const slice = filtered.slice(Math.max(0, filtered.length - limit));
    const hasMore = filtered.length > limit;
    return { messages: slice, hasMore };
  }
}

// 4. Update status with clientMessageId deduplication
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
