# Editorial & Calm — E2EE Real-Time Chat PWA

> An installable, real-time Progressive Web App (PWA) with audited End-to-End Encryption (E2EE), designed around an **Editorial & Calm** aesthetic. Crafted with warm paper-like typography, spacious layouts, zero technical jargon, and absolute cryptographic privacy.

---

## 📖 Design Identity: "Editorial & Calm"

Unlike noisy messaging apps or crypto tools cluttered with badges and glowing shields, this application evokes a quiet, premium reading room for intimate conversations.

- **Typography-Led**: Elegant serif display headlines in [Fraunces](https://fonts.google.com/specimen/Fraunces) paired with crisp, readable UI text in [Inter](https://fonts.google.com/specimen/Inter).
- **Signature Received Messages**: Received messages have **no bubble** — plain text breathes directly on the warm paper base, creating an open, unconfined reading flow.
- **Restrained Color Palette**: A single accent color per theme:
  - **Light Theme**: Warm paper base (`#F6F2EA`), deep forest accent (`#2F5D50`), soft earth avatars.
  - **Dark Theme**: Rich espresso base (`#14120E`), layered surfaces (`#1C1914`, `#25211A`), bright sage-mint accent (`#6FB59B`), and 4 rotating warm avatar hues.
- **Zero Jargon**: Encryption is presented simply as a quiet lock icon and one human sentence: *"Messages are end-to-end encrypted."* In-depth mathematical audit proofs and safety numbers reside inside an optional Security Details screen (`/security/:id`).

---

## 🔒 Cryptographic Architecture & Security

All cryptography is powered by audited primitives from [`libsodium-wrappers`](https://github.com/jedisct1/libsodium.js) (`libsodium v1.0.18+`):

1. **Identity & Pre-Keys**:
   - Long-term Ed25519 identity key pairs, converted birationally to X25519 for Diffie-Hellman exchanges.
   - Signed Pre-Keys (SPK) with detached Ed25519 signatures.
   - Batches of One-Time Pre-Keys (OPKs) published to the server and consumed atomically.
2. **Session Setup (X3DH)**:
   - Extended Triple Diffie-Hellman key agreement combining up to 4 DH computations ($DH_1$ through $DH_4$) to establish a shared master secret.
3. **Forward Secrecy (Symmetric Ratchet)**:
   - Irreversible HMAC-SHA512 chain ratchets step forward with every message sent and received.
   - Message keys are single-use 32-byte keys that are deleted from memory immediately after encryption/decryption.
4. **AEAD Authenticated Encryption**:
   - Every message is encrypted using **XChaCha20-Poly1305** with a 24-byte random nonce.
   - Authenticated Data (AD) binds sender ID, recipient ID, and timestamp to prevent replay and cross-chat tampering.
5. **Zero-Plaintext Server**:
   - The Fastify backend stores **only** base64 ciphertext and nonces.
   - Media files (photos, audio) are encrypted on the client device using symmetric secretboxes before upload; the server stores only opaque encrypted blobs.
   - Web Push notifications contain zero plaintext (triggering local service worker decryption).
6. **Safety Numbers**:
   - 12 groups of 5 decimal digits computed from lexicographically sorted identity keys for out-of-band identity verification.

---

## 📱 Progressive Web App (PWA) Features

- **Installable**: Full Web App Manifest (`manifest.webmanifest`) and custom installation banner for Android Chrome and iOS Safari.
- **iOS Safari Native Feel**: Supports `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`, and safe-area inset padding (`env(safe-area-inset-*)`).
- **Offline Shell & IndexedDB**: Service worker caches application assets via Workbox. IndexedDB (`idb`) persists chats, message history, and an offline outbox queue that automatically flushes when reconnected.

---

## 🏗 Monorepo Architecture

```
.
├── client/                     # Vite + React 19 + TypeScript + Tailwind CSS v4 PWA
│   ├── public/                 # Icons, manifest, audio assets
│   ├── src/
│   │   ├── components/         # Reusable UI (Avatar, BottomNav, Composer, etc.)
│   │   ├── contexts/           # AuthContext, ChatContext
│   │   ├── hooks/              # usePWAInstall, useTheme
│   │   ├── lib/
│   │   │   ├── api.ts          # Authenticated REST client
│   │   │   ├── crypto.ts       # Audited libsodium E2EE engine & keystore
│   │   │   ├── db.ts           # IndexedDB offline store (messages, chats, outbox)
│   │   │   ├── encryptedMedia.ts # Client-side media encryption & upload
│   │   │   ├── pushClient.ts   # Web Push VAPID subscriber
│   │   │   └── wsClient.ts     # Resilient WebSocket client with backoff
│   │   ├── pages/              # ChatListPage, ConversationPage, ProfilePage, etc.
│   │   ├── screens/            # StatesScreen, SecurityDetailsScreen
│   │   ├── styles/             # tokens.css (Design tokens single source of truth)
│   │   └── sw.ts               # Custom Service Worker with Push & Precaching
│   ├── index.html
│   └── vite.config.ts
│
├── server/                     # Fastify + WebSocket + Prisma Backend
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (User, Session, Message, PreKey, etc.)
│   │   └── dev.db              # SQLite development database
│   ├── src/
│   │   ├── auth.ts             # Argon2 password hashing, short-lived JWT, refresh cookies
│   │   ├── chats.ts            # Chat listings and history endpoints
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── index.ts            # Fastify server entry point
│   │   ├── keys.ts             # Pre-key bundle management & zero-plaintext audit logs
│   │   ├── media.ts            # Ciphertext media upload & download streaming
│   │   ├── push.ts             # VAPID Web Push dispatch (zero plaintext)
│   │   └── ws.ts               # Real-time WebSocket server (/ws)
│   └── tsconfig.json
│
├── docs/                       # Technical documentation
│   ├── design-brief.md         # Approved Design Identity tokens & rules
│   ├── security-model.md       # Cryptographic specifications & threat boundaries
│   └── ios-android-test.md     # Mobile physical device testing checklist
│
└── package.json                # Monorepo workspace configuration
```

---

## 🚀 Quickstart & Development

### 1. Prerequisites
- **Node.js**: v20 or v22 LTS
- **npm**: v10+

### 2. Installation
Install all dependencies across client and server:
```bash
npm install
```

### 3. Initialize Database
Initialize the SQLite database with Prisma migrations:
```bash
cd server
npm run db:push
```

### 4. Start Development Servers
You can run both client and server concurrently:

**Start the Fastify Backend (Port 3001)**:
```bash
cd server
npm run dev
```

**Start the React Vite PWA (Port 5173)**:
```bash
cd client
npm run dev -- --host 0.0.0.0 --port 5173
```

Open your browser to:
- **Local**: `http://localhost:5173/`
- **Mobile Device (Same Wi-Fi)**: `http://<YOUR_LOCAL_IP>:5173/`

### 5. Demo Accounts
The server seeds 4 demo users upon initial launch:
- `maya` / `password123` (Maya Lin)
- `alex` / `password123` (Alex Mercer)
- `julian` / `password123` (Julian Vance)
- `elena` / `password123` (Elena Rostova)

Switch between accounts instantly from **Settings $\rightarrow$ Switch Active Demo Account**.

---

## 🧪 Testing & Verification

### Build Client
```bash
cd client
npm run build
```

### Build Server
```bash
cd server
npm run build
```

---

## 📄 License
MIT License. Created with care for private, calm communication.
