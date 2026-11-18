# Security Policy & Cryptographic Model

WhatsUS is built with a commitment to **honesty over marketing**. We document our precise security guarantees, our threat model, our architectural boundaries, and our explicit limitations.

---

## 1. Threat Model & Guarantees

### What WhatsUS Protects Against

1. **Passive Network Adversaries**:
   All HTTP and WebSocket traffic is protected by Transport Layer Security (TLS 1.3 / HTTPS via Caddy with HSTS and strict CSP). Even if TLS is terminated or inspected (e.g. by a malicious proxy or corporate root certificate), all message contents, media, and voice/video signaling remain protected by end-to-end encryption.

2. **Compromised Server & Untrusted Infrastructure**:
   The backend Fastify server is treated as an untrusted message router:
   - Messages are stored as opaque ciphertext blobs. The server never possesses private identity keys, ratchet keys, or message decryption keys.
   - Media files (photos, audio) are client-side encrypted using chunk-safe `crypto_secretstream_xchacha20poly1305` before upload. Media decryption keys, nonces, and MIME types are transmitted exclusively inside the E2EE envelope.
   - Web Push notifications contain **zero plaintext** and zero sender identifiers, acting solely as wakeup pings for the service worker.

3. **Compromise of Past Keys (Forward Secrecy)**:
   WhatsUS implements the Signal Double Ratchet protocol using libsodium primitives. Symmetric KDF chain ratchets advance forward with every message sent and received. Derived message keys are single-use 32-byte keys that are zeroed from client memory immediately after encryption or decryption. A compromise of current keys does not expose past conversations.

4. **Break-In Recovery (Post-Compromise Security)**:
   The Double Ratchet integrates a Diffie-Hellman (DH) ratchet that steps forward upon every conversational turn. Each turn creates a fresh ephemeral keypair and derives a new root key, healing the cryptographic channel after any temporary state compromise.

5. **Ciphertext Tampering & Replay Attacks**:
   All payloads are authenticated using **XChaCha20-Poly1305** (24-byte random nonce, 128-bit Poly1305 MAC tag). The AEAD Associated Data (AD) binds the sender's identity key, receiver's identity key, and chain sequence number. Any bit flip or attempt to replay a message in a different conversation causes decryption to fail closed.

6. **Out-of-Order Delivery**:
   Out-of-order and dropped messages are handled by storing skipped message keys in an in-memory session map (capped at a strict boundary of 1,000 keys) without breaking ratchet state.

7. **Cryptographic Identity Verification**:
   Users can detect Man-in-the-Middle (MitM) attacks by comparing visual Safety Numbers (12 groups of 5 decimal digits derived from identity keys) or scanning the QR code in the Security Details screen.

---

### What WhatsUS Does NOT Protect Against

1. **Compromised Endpoint / Operating System Malware**:
   If an adversary controls the physical device or operating system (e.g. keylogger, rootkit, malicious browser extension, or screen scraper), the adversary can read decrypted messages in the DOM or extract keys from memory. No software-level messaging app can defend against a compromised OS.

2. **Cross-Site Scripting (XSS)**:
   While WhatsUS enforces strict Content Security Policy (`@fastify/helmet` with no inline scripts, strict connect-src, and HSTS), browser-based JavaScript execution means that any execution of arbitrary script in the origin context can bypass application logic.

3. **Active Server MitM Prior to Out-of-Band Verification (TOFU Limitation)**:
   WhatsUS uses a **Trust-on-First-Use (TOFU)** model. The server distributes public pre-key bundles. If the server is actively malicious during initial contact, it could substitute Alice's public keys with its own. **Defense**: Users must verify visual Safety Numbers out-of-band (or via QR code) to guarantee authenticity. Once a contact's identity key is recorded, any subsequent key change triggers a blocking "Safety Number Changed" warning.

4. **Traffic Metadata & Communication Timing**:
   The server necessarily observes:
   - IP addresses and WebSocket connection durations.
   - Message transmission timestamps and frequency.
   - Exact size of encrypted message envelopes and media blobs.
   - Sender and recipient user IDs (to route messages).
   WhatsUS does not use onion routing (Tor) or metadata-scrambling cover traffic.

---

## 2. Honest Accounting & Known Limitations

- **Single Device per Account (v1)**:
  WhatsUS v1 is strictly single-device. Logging in on a new device generates new cryptographic keys and supersedes the old device. Contacts will see a "Safety Number Changed" alert indicating that a new key has been registered. WhatsUS does **not** claim multi-device synchronization.

- **Browser Key Storage vs. Secure Hardware**:
  Private identity and ratchet keys are stored in IndexedDB wrapped with a non-extractable WebCrypto AES-GCM key. While this prevents simple inspection via developer console `localStorage` dumps, browser storage does not provide the hardware-enforced protection of a Secure Enclave or TPM.

- **Verifiable Builds**:
  Browser-delivered PWAs run code fetched from the server. Although Service Worker caching ensures deterministic code execution once installed, the initial download relies on server integrity.

- **Fail-Closed Guarantee**:
  If encryption or decryption fails (e.g., due to key corruption, signature mismatch, or tampering), the message is **never sent** and **never displayed as plaintext**. There is no fallback to unencrypted communication.

- **Link Previews & External URL Protection (v1 Architecture)**:
  Browsers cannot fetch arbitrary web pages cross-origin due to CORS. Fetching link previews directly on the sender's device without a proxy is technically impossible in a browser, and routing requests through a server proxy would expose target URLs and user IPs to the proxy operator.
  To eliminate these privacy risks in v1:
  - WhatsUS performs link detection on the client and displays only the parsed destination domain.
  - Zero background link scraping or preview fetching is executed by either the server or recipient.
  - Tapping a link opens an in-app Safety Interstitial modal showing the full URL and destination domain before navigation.
  - A privacy toggle (`Settings > Privacy > Link previews`, default OFF) is provided as a feature flag for any future user-chosen opt-in proxy.

- **"Delete for Everyone" & Message Editing (Best-Effort Semantics)**:
  - Message edits (within a 15-minute sender-clock window) and "Delete for everyone" commands are transmitted strictly inside the authenticated Double Ratchet E2EE envelope as control messages.
  - The recipient client only accepts edits or deletions if the sender of the control message cryptographically matches the sender of the original message.
  - **Honest Limitation**: Both "Delete for everyone" and the 15-minute edit window are **best-effort**. If a recipient operates a modified client, customized build, or local database backup, they can retain copies of previously received messages and ignore deletion or edit control payloads.

- **Zero-Plaintext In-Memory Search Index**:
  - The client-side full-text search index (MiniSearch with `Intl.Segmenter`) is maintained purely in memory during an active unlocked session.
  - The search index is **never stored as plaintext in IndexedDB**.
  - When messages are deleted, edited, or cleared, the in-memory search index is immediately updated.
  - The index is destroyed upon logout, session revocation, or application lock.

- **Client-Side Encrypted Backups (Argon2id + XChaCha20-Poly1305)**:
  - Encrypted backups are derived entirely on the client device using **Argon2id (RFC 9106)** with 64 MB of memory, 2 iterations, 1 lane, and a 16-byte CSPRNG salt.
  - The derived 256-bit symmetric key encrypts the local message database, chat state, and cryptographic key material with libsodium `crypto_secretbox_easy` (XChaCha20-Poly1305, 24-byte random nonce).
  - Sensitive key material in memory is zeroed immediately after derivation via `sodium.memzero`.
  - **Zero Server Plaintext**: The server stores only raw ciphertext, salt, and nonce. The server has zero knowledge of the passphrase or contents.
  - **Zero-Knowledge Recovery**: If the user loses their recovery passphrase, the backup is **mathematically impossible to recover**. WhatsUs provides no password reset or bypass.

- **WebAuthn Passkeys (FIDO2)**:
  - Passkeys use W3C WebAuthn / FIDO2 public-key cryptography tied to device authenticators (Touch ID, Face ID, Windows Hello, security keys).
  - The server issues a cryptographically random, single-use auth nonce (`AuthNonce` table with a 5-minute TTL).
  - The client signs the challenge using the hardware-bound private key. The server stores only the public key, credential ID, and signature counter.
  - No passwords or shared secrets are transmitted or stored on the server.

- **App Lock & Inactivity Timeout (Client Boundary)**:
  - App Lock protects against casual shoulder-surfing or unauthorized device access while the device is unlocked.
  - The user's PIN is salted with 16 random bytes and hashed with SHA-256 in client storage.
  - When enabled, the app automatically locks upon entering the background (`visibilitychange`) after the configured timeout (immediately up to 1 hour).
  - Background task-switcher preview leakage is mitigated by applying the `.app-locked` blur filter class to `document.body` whenever the app is locked or hidden.
  - **Honest Limitation**: App Lock is an application-level UI barrier within the browser runtime. It does not replace full-disk encryption and cannot protect against an adversary with physical root access who dumps IndexedDB storage.

- **Disappearing Messages (Server Retention & Client Eviction)**:
  - Disappearing message timers (Off, 1 hour, 24 hours, 7 days) are configured per-chat and communicated as encrypted control envelopes.
  - **Server Retention**: Undelivered messages with an expiration timestamp (`expiresAt <= NOW()`) are permanently deleted from Postgres by the background retention scheduler.
  - **Client Eviction**: A local background timer sweeps IndexedDB and the in-memory search index every 10 seconds, permanently removing expired messages and search tokens.
  - **Honest Limitation**: Disappearing messages are **best-effort**. While WhatsUs prevents standard saving or forward flows, a recipient running a modified browser, taking screenshots, or capturing external photos can preserve message contents.

- **1:1 Polls & Live Voting**:
  - Poll questions, options, and live votes travel exclusively inside the end-to-end encrypted Double Ratchet channel.
  - The server observes only standard ciphertext envelope metadata (sender, receiver, timestamp) and has zero knowledge of poll questions, options, votes, or tallies.

---

## 3. Compromised Secrets Notice & Rotation

The original demo version of this project contained placeholder secrets. All have been eliminated and rotated:

1. **`JWT_SECRET`**:
   The old placeholder secret has been revoked. The production server refuses to start if `JWT_SECRET` is missing from the environment or shorter than 32 random bytes.
2. **Web Push VAPID Keys**:
   Old demo VAPID keys have been discarded. Fresh keys must be generated using `node scripts/generate-secrets.mjs`.
3. **Database & Passwords**:
   All demo user seeds (`maya`, `alex`, `julian`, `elena` with `password123`) and SQLite `dev.db` files have been removed from the repository. All password authentication has been deleted in favor of Google Identity Services with single-use server nonces.
4. **Encrypted Media Storage**:
   Any legacy files in `server/uploads/` have been removed. Media is now encrypted with authenticated `crypto_secretstream`.

---

## 4. Responsible Disclosure

If you discover a security vulnerability in WhatsUS, please report it privately:

- **Email**: `security@whatsus.app`
- **PGP Key**: Available upon request.
- **Response Timeline**: We acknowledge reports within 48 hours and provide a remediation timeline within 7 days.
- Please do **not** open public GitHub issues for undisclosed vulnerabilities.
