# WhatsUs User Guide & Help Center

Welcome to **WhatsUs** — a private, fast, and end-to-end encrypted messaging application built for real people. This guide explains how WhatsUs protects your privacy, how to use its core features, and how to verify your security.

---

## 1. How Your Privacy is Protected (Plain Language)

### End-to-End Encryption (E2EE)
When you send a message, voice note, photo, reaction, or poll vote on WhatsUs:
1. **Your device encrypts it** before it leaves your browser or phone using state-of-the-art cryptographic keys.
2. **The server only sees scrambled ciphertext**. The WhatsUs server cannot read your text, see your pictures, listen to your voice notes, or see what you voted in a poll.
3. **Only your recipient's device can decrypt it**. Even if someone intercepts the transmission or breaches the server database, your conversations remain completely unreadable.

### Forward Secrecy & Break-In Recovery
WhatsUs uses the **Double Ratchet protocol** (the same mathematical system created by Signal):
- Every single message has a unique, single-use encryption key that is discarded immediately after delivery.
- If someone ever stole a key, they could not use it to decrypt past messages (**Forward Secrecy**).
- Every time you reply, fresh mathematical keys are generated, automatically healing the connection from past compromises (**Post-Compromise Security**).

---

## 2. Verifying Your Contacts (Safety Numbers)

Every conversation has a unique **Safety Number** (a 60-digit number and QR code) computed from both your and your contact's cryptographic identity keys:

1. Open a chat and tap your contact's name at the top.
2. Tap **"Verify Security / Safety Number"**.
3. Compare the number with your friend's screen, or scan their QR code in person.
4. If the numbers match, you are guaranteed that no third party (including WhatsUs) is eavesdropping or impersonating your contact.

> **Safety Number Alert**: If your contact reinstalls the app or moves to a new device, their keys change. WhatsUs will immediately alert you in chat that their Safety Number has changed so you can re-verify.

---

## 3. Account Security & Login Methods

### Signing In with Google
WhatsUs uses Google Sign-In for easy authentication without passwords. Your Google email is used only as a recovery credential and is **never visible** to other users. Other users find you strictly through your unique `@username`.

### Passkeys & Biometric Login
You can sign in using **Face ID, Touch ID, or Windows Hello** without relying on your Google account:
1. Go to **Settings > Security & Passkeys**.
2. Tap **"Add Passkey"**.
3. Follow your device prompt to register your fingerprint or facial scan.
4. On future logins, tap **"Sign in with Passkey / Biometrics"** on the login screen for instant, passwordless access.

---

## 4. App Lock & Privacy

Protect your chats from anyone who picks up your unlocked phone or computer:
1. Go to **Settings > Security & Passkeys > App Lock**.
2. Switch **App Lock** to **ON**.
3. Set a 4-to-8 digit PIN and choose whether to allow biometric unlock.
4. Choose your auto-lock timeout (Immediately upon switching away, 1 minute, 5 minutes, 15 minutes, or 1 hour).
5. While locked, WhatsUs automatically blurs and hides your messages in your operating system's app switcher.
6. To manually lock at any time, tap **"Lock Now"** in Settings.

---

## 5. End-to-End Encrypted Backups & Restore

Your chats and cryptographic keys are stored directly on your device. To ensure you never lose your history if you switch devices:

### Creating an Encrypted Backup
1. Go to **Settings > End-to-End Encrypted Backup**.
2. Tap **"Back Up Now"**.
3. Choose a strong **Recovery Passphrase** (at least 8 characters).
4. Tap **"Upload Encrypted Cloud Backup"** or **"Download .whatsus.enc File"**.
5. Your device uses **Argon2id** (military-grade key derivation) to lock your backup before sending it.

> **CRITICAL WARNING**: WhatsUs cannot recover or reset your recovery passphrase. If you forget your passphrase, your backup is mathematically unrecoverable. Write it down in a safe place.

### Restoring Your History
1. On your new device, go to **Settings > End-to-End Encrypted Backup > Restore Conversations & Keys**.
2. Enter your recovery passphrase.
3. Tap **"Restore from Cloud"** (or upload your saved `.whatsus.enc` file).
4. Your messages, contacts, and encryption keys will be instantly restored.

---

## 6. Disappearing Messages

You can configure messages in any chat to automatically vanish:
1. Open a chat and tap the **Clock icon** in the top bar.
2. Select an expiration timer: **Off**, **1 Hour**, **24 Hours**, or **7 Days**.
3. Both you and your friend will see a confirmation notice.
4. Any message sent while active will automatically delete itself once the timer expires.

> **Important Honesty Notice**: Disappearing messages are best-effort. If someone takes a physical photo of their screen or runs a modified client, they can save messages. Only share sensitive data with people you trust.

---

## 7. Interactive Polls & Shared Media Gallery

### Creating a Poll
1. In a chat, tap the **Poll icon (bar chart)** next to the message input.
2. Enter your question and 2 to 6 answer choices.
3. Tap **"Send Poll"**.
4. Both participants can tap options to vote in real-time. Votes travel inside the encrypted channel, so only the two of you see the results.

### Shared Media Gallery
1. In a chat, tap the **Media icon (photo/filmstrip)** in the header.
2. Browse all Photos, Voice Notes, Shared Web Links, and Starred messages exchanged in that conversation.

---

## 8. Need Help or Found a Bug?

- **Data Export**: You can download a decrypted JSON copy of all your local chats at any time via **Settings > Export Local Data**.
- **Delete Account**: Tap **Settings > Delete Account** to permanently erase your profile, cryptographic keys, and active sessions.
- **Support**: Reach out to `support@whatsus.app` or report security disclosures to `security@whatsus.app`.
