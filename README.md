# WhatsUS — Editorial & Calm E2EE Messenger

> An installable, real-time Progressive Web App (PWA) with audited End-to-End Encryption (E2EE), designed around an **Editorial & Calm** aesthetic. Built for real people with Google Sign-In, stable identities, Signal X3DH + Double Ratchet cryptography, and PostgreSQL.

---

## 📖 Design Identity: "Editorial & Calm"

Unlike noisy messaging apps or crypto tools cluttered with badges and glowing shields, WhatsUS evokes a quiet, premium reading room for intimate conversations.

- **Typography-Led**: Elegant serif display headlines in [Fraunces](https://fonts.google.com/specimen/Fraunces) paired with crisp, readable UI text in [Inter](https://fonts.google.com/specimen/Inter).
- **Signature Received Messages**: Received messages have **no bubble** — plain text breathes directly on the warm paper base, creating an open, unconfined reading flow.
- **Restrained Color Palette**:
  - **Light Theme**: Warm paper base (`#F6F2EA`), deep forest accent (`#2F5D50`), soft earth avatars.
  - **Dark Theme**: Rich espresso base (`#14120E`), layered surfaces (`#1C1914`, `#25211A`), bright sage-mint accent (`#6FB59B`), and 4 rotating warm avatar hues.
- **Zero Jargon**: Encryption is presented simply as a quiet lock icon and human assurance: *"Messages are end-to-end encrypted."* Safety numbers and QR codes reside inside the Security Details screen (`/security/:id`).

---

## 🔒 Cryptographic Architecture & Security

All protocol mechanics adhere to the Signal X3DH and Double Ratchet specifications, implemented with primitives from [`libsodium-wrappers`](https://github.com/jedisct1/libsodium.js) (`libsodium v1.0.18+`):

1. **Identity & Pre-Keys**:
   - Long-term Ed25519 identity key pairs, converted birationally to X25519 for Diffie-Hellman exchanges.
   - Signed Pre-Keys (SPK) with detached Ed25519 signatures verified on every bundle fetch.
   - Batches of One-Time Pre-Keys (OPKs) published to the server and consumed atomically in database transactions.
2. **Session Setup (X3DH)**:
   - Extended Triple Diffie-Hellman key agreement combining up to 4 DH computations ($DH_1$ through $DH_4$) to establish a shared root secret.
3. **Double Ratchet (Forward Secrecy & Post-Compromise Security)**:
   - Symmetric KDF chain ratchets step forward with every message sent and received.
   - DH ratchets step forward upon every turn change, creating fresh DH keys and deriving new chain keys.
   - Message keys are single-use 32-byte keys zeroed from memory immediately after encryption/decryption.
   - Out-of-order and dropped messages are handled via bounded skipped message keys (capped at 1,000 keys).
4. **AEAD Authenticated Encryption**:
   - Every message is encrypted using **XChaCha20-Poly1305** with a 24-byte random nonce.
   - Associated Data (AD) binds sender ID, recipient ID, and sequence to prevent replay and cross-chat tampering.
   - **Fail closed**: If encryption fails, the message is NEVER sent. Zero plaintext fallback.
5. **Zero-Plaintext Server**:
   - Fastify backend stores **only** base64 ciphertext, nonces, and routing envelopes.
   - Media files (photos, audio) are encrypted client-side using chunk-safe `crypto_secretstream_xchacha20poly1305`; keys and nonces are transmitted ONLY inside the E2EE envelope.
   - Web Push notifications contain zero plaintext (serving purely as wakeup triggers).
6. **Key Wrapping in Local Storage**:
   - Private identity and ratchet keys are wrapped in IndexedDB using non-extractable WebCrypto AES-GCM keys.
7. **Single-Device Scope (v1)**:
   - WhatsUS v1 is strictly single-device per account. Logging in on a new device generates new keys and alerts contacts with a visual "safety number changed" banner before sending.

For complete threat boundaries and audit limitations, see [SECURITY.md](SECURITY.md) and [docs/crypto-decision.md](docs/crypto-decision.md).

---

## 📱 Progressive Web App (PWA) Features

- **Installable**: Full Web App Manifest (`manifest.webmanifest`) and custom installation banner for Android Chrome and iOS Safari.
- **iOS Safari Native Feel**: Supports `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`, and safe-area inset padding (`env(safe-area-inset-*)`).
- **Offline Outbox & IndexedDB**: Messages sent offline are persisted in IndexedDB and flush automatically on reconnect with exponential backoff.
- **Message Delivery Status**: Real-time indicators: queued offline (clock icon) $\rightarrow$ sent (single check) $\rightarrow$ delivered (double check) $\rightarrow$ read (accent double check).

---

## 🏗 Monorepo Architecture

```
.
├── client/                     # Vite + React 19 + TypeScript + Tailwind CSS v4 PWA
│   ├── public/                 # Icons, manifest, audio assets
│   ├── src/
│   │   ├── components/         # Reusable UI (Avatar, BottomNav, CallModal, etc.)
│   │   ├── contexts/           # AuthContext, ChatContext, CallContext, ThemeContext
│   │   ├── hooks/              # usePWAInstall, useTheme
│   │   ├── lib/
│   │   │   ├── api.ts          # Authenticated REST client
│   │   │   ├── crypto.ts       # Signal X3DH + Double Ratchet E2EE protocol engine
│   │   │   ├── db.ts           # IndexedDB offline store (messages, chats, outbox)
│   │   │   ├── encryptedMedia.ts # Chunk-safe secretstream media encryption
│   │   │   ├── pushClient.ts   # Web Push VAPID subscriber
│   │   │   └── wsClient.ts     # Ticket-authenticated WebSocket client
│   │   ├── pages/              # ChatListPage, ConversationPage, ConnectPage, etc.
│   │   └── styles/             # tokens.css & index.css
│   ├── index.html
│   └── vite.config.ts
│
├── server/                     # Fastify + WebSocket + PostgreSQL Backend
│   ├── prisma/
│   │   ├── schema.prisma       # PostgreSQL schema with message queueing indexes
│   │   └── migrations/         # Version-controlled Prisma migration history
│   ├── src/
│   │   ├── auth.ts             # Google ID token verification & session rotation
│   │   ├── chats.ts            # Chat listings and history endpoints
│   │   ├── contacts.ts         # Exact @username lookup, requests, blocks, invites
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── index.ts            # Fastify server entry point with CSP & redaction
│   │   ├── keys.ts             # Pre-key bundle management & signature enforcement
│   │   ├── media.ts            # Ciphertext media upload & download streaming
│   │   ├── push.ts             # VAPID Web Push dispatch (zero plaintext)
│   │   ├── retention.ts        # Automated 30-day message retention cleanup
│   │   ├── turn.ts             # Coturn RFC 5766 REST API ephemeral credentials
│   │   ├── ws.ts               # Real-time WebSocket server (/ws)
│   │   └── wsTicket.ts         # Single-use WebSocket connection tickets
│   └── tsconfig.json
│
├── docs/                       # Technical documentation
│   ├── crypto-decision.md      # Cryptographic protocol evaluation & justification
│   ├── DEPLOY.md               # VPS production deployment runbook (Ubuntu 24.04)
│   └── security-model.md       # Cryptographic specifications & threat boundaries
│
└── package.json                # Monorepo workspace configuration
```

---

## 🚀 Quickstart & Development

### 1. Prerequisites
- **Node.js**: v20 or v22 LTS
- **PostgreSQL**: Running locally or via Docker
- **npm**: v10+

### 2. Installation
```bash
npm install
```

### 3. Generate Secrets
```bash
node scripts/generate-secrets.mjs
```

### 4. Deploy Database Migrations
```bash
npx prisma migrate deploy --schema server/prisma/schema.prisma
```

### 5. Start Development Servers
Run both client and server concurrently:
```bash
# Terminal 1: Backend
npm run dev --workspace=server

# Terminal 2: Frontend PWA
npm run dev --workspace=client
```

---

## 🧪 Testing & Verification

Run the full automated test suite:
```bash
npm test
```

Build all packages:
```bash
npm run build:all
```

For full VPS deployment instructions, see [docs/DEPLOY.md](docs/DEPLOY.md).

---

## 📄 License
MIT License. Created with care for private, calm communication.
