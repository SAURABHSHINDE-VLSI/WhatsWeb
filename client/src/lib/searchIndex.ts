import MiniSearch from 'minisearch';
import { LocalMessage } from './db';

export interface SearchResultItem {
  id: string;
  partnerId: string;
  createdAt: string;
  snippet: string;
  type: string;
  matchScore: number;
}

interface IndexableDoc {
  id: string;
  partnerId: string;
  text: string;
  caption: string;
  fileName: string;
  createdAt: string;
  snippet: string;
  type: string;
}

// Multilingual tokenizer using Intl.Segmenter for word boundaries (handles CJK, scripts without spaces)
let segmenter: Intl.Segmenter | null = null;
try {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  }
} catch {
  segmenter = null;
}

function tokenize(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  if (segmenter) {
    const tokens: string[] = [];
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) {
        tokens.push(seg.segment.toLowerCase());
      }
    }
    return tokens.length > 0 ? tokens : text.toLowerCase().split(/\s+/).filter(Boolean);
  }
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

// In-Memory search index ONLY (Zero plaintext persistence in IndexedDB)
let inMemorySearchIndex: MiniSearch<IndexableDoc> | null = null;

function getSearchIndex(): MiniSearch<IndexableDoc> {
  if (!inMemorySearchIndex) {
    inMemorySearchIndex = new MiniSearch<IndexableDoc>({
      fields: ['text', 'caption', 'fileName'],
      storeFields: ['id', 'partnerId', 'createdAt', 'snippet', 'type'],
      tokenize,
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { text: 2, caption: 1.5, fileName: 1 },
      },
    });
  }
  return inMemorySearchIndex;
}

function messageToDoc(msg: LocalMessage): IndexableDoc | null {
  if (msg.isDeletedForEveryone || msg.content.includes('[Could not decrypt')) {
    return null;
  }

  let text = '';
  let caption = '';
  let fileName = '';

  if (msg.type === 'photo' || msg.type === 'voice') {
    if (msg.content.startsWith('{')) {
      try {
        const payload = JSON.parse(msg.content);
        caption = payload.caption || '';
        fileName = payload.fileName || '';
      } catch {}
    }
  } else {
    text = msg.content;
  }

  const snippet = text || caption || fileName || (msg.type === 'voice' ? 'Voice note' : 'Photo');

  return {
    id: msg.id,
    partnerId: msg.partnerId,
    text,
    caption,
    fileName,
    createdAt: msg.createdAt,
    snippet,
    type: msg.type,
  };
}

/**
 * Initializes or re-indexes decrypted messages in memory on app unlock
 */
export function initSearchIndex(messages: LocalMessage[]): void {
  const index = getSearchIndex();
  index.removeAll();

  const docs: IndexableDoc[] = [];
  for (const m of messages) {
    const doc = messageToDoc(m);
    if (doc) docs.push(doc);
  }

  if (docs.length > 0) {
    index.addAll(docs);
  }
}

/**
 * Add a newly received or decrypted message to the in-memory index
 */
export function addMessageToSearch(msg: LocalMessage): void {
  const index = getSearchIndex();
  const doc = messageToDoc(msg);
  if (doc) {
    // If already exists, remove first then re-add
    if (index.has(doc.id)) {
      index.discard(doc.id);
    }
    index.add(doc);
  }
}

/**
 * Update an edited message in the search index
 */
export function updateMessageInSearch(msg: LocalMessage): void {
  const index = getSearchIndex();
  if (index.has(msg.id)) {
    index.discard(msg.id);
  }
  const doc = messageToDoc(msg);
  if (doc) {
    index.add(doc);
  }
}

/**
 * Remove a deleted or expired message from the in-memory index
 */
export function removeMessageFromSearch(messageId: string): void {
  const index = getSearchIndex();
  if (index.has(messageId)) {
    index.discard(messageId);
  }
}

/**
 * Search messages across local memory
 */
export function searchLocalMessages(
  query: string,
  partnerId?: string
): SearchResultItem[] {
  if (!query || !query.trim()) return [];
  const index = getSearchIndex();

  const results = index.search(query.trim(), {
    filter: partnerId ? (doc) => doc.partnerId === partnerId : undefined,
  });

  return results.slice(0, 30).map((r) => ({
    id: r.id,
    partnerId: r.partnerId,
    createdAt: r.createdAt,
    snippet: r.snippet,
    type: r.type,
    matchScore: r.score,
  }));
}

/**
 * Wipe search index completely from memory (called on logout, account deletion, or app lock)
 */
export function wipeSearchIndex(): void {
  if (inMemorySearchIndex) {
    inMemorySearchIndex.removeAll();
    inMemorySearchIndex = null;
  }
}
