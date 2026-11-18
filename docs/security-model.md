# Security Model & Cryptographic Specifications

This document defines the security architecture, cryptographic primitives, threat boundaries, and trust model for the **Editorial & Calm** End-to-End Encrypted (E2EE) Progressive Web App.

---

## 1. Threat Model & Adversary Capabilities

### 1.1 Adversary Profiles
1. **Malicious or Compromised Server (Untrusted Cloud Host)**:
   - Controls database queries, HTTP endpoints, WebSocket routing, and file uploads.
   - May inspect stored tables (`messages`, `users`, `prekey_bundles`, `uploads`).
   - May attempt passive wiretapping, message tampering, replay attacks, or selective dropping.
2. **Network Adversary (Man-in-the-Middle / ISP / Public Wi-Fi)**:
   - Intercepts, inspects, or modifies transport-layer packets.
   - Mitigated by mandatory TLS 1.3 encryption on all REST and WebSocket channels.
3. **Malicious Push Notification Service (Apple APNs / Google FCM)**:
   - Receives Web Push dispatch payloads from our server.
   - May inspect notification headers and bodies.
   - Mitigated by **Zero-Plaintext Web Push** (no text, sender message, or key material is ever included in push packets).
4. **Local Device Physical Thief (Device Seizure)**:
   - Gains physical access to an unlocked or locked device.
   - Addressed by local IndexedDB key storage and application lock.

### 1.2 Security Guarantees
- **Confidentiality**: Only the sender and recipient possessing the derived message keys can decrypt message text, attachments, and metadata.
- **Integrity & Authenticity**: Every message is protected by an authenticated AEAD tag (Poly1305) over both ciphertext and Associated Data (binding sender ID, receiver ID, and timestamp). Bit-flipping and replay across conversations are immediately rejected.
- **Forward Secrecy**: Ephemeral ratchets advance after each transmission. Compromise of a device's current ratchet key cannot decrypt previous message history.
- **Zero-Knowledge Server Storage**: The server never sees plaintext messages, media encryption keys, or pre-key private components.

---

## 2. Cryptographic Primitives

All cryptographic operations are executed strictly via audited, battle-tested primitives from [`libsodium-wrappers`](https://github.com/jedisct1/libsodium.js) (`libsodium v1.0.18+`). Custom or unvetted cryptographic algorithms are strictly prohibited.

| Purpose | Primitive / Algorithm | Libsodium Method | Key / Nonce Size |
| :--- | :--- | :--- | :--- |
| **Identity Signing** | Ed25519 (Edwards-curve Digital Signature) | `crypto_sign_keypair` / `crypto_sign_detached` | 32-byte public, 64-byte private |
| **Diffie-Hellman Key Exchange** | X25519 (Montgomery curve Curve25519) | `crypto_scalarmult` | 32-byte public, 32-byte private |
| **Curve Conversion** | Birational equivalence Ed25519 $\leftrightarrow$ X25519 | `crypto_sign_ed25519_pk_to_curve25519` | 32 bytes |
| **Authenticated Encryption** | XChaCha20-Poly1305-IETF (AEAD) | `crypto_aead_xchacha20poly1305_ietf_encrypt` | 32-byte key, 24-byte nonce, 16-byte tag |
| **Media Symmetric Encryption** | XSalsa20-Poly1305 (Secretbox) | `crypto_secretbox_easy` | 32-byte key, 24-byte nonce, 16-byte tag |
| **Key Derivation Function** | BLAKE2b / SHA-512 based KDF | `crypto_auth_hmacsha512` / `crypto_hash` | 32-byte context / output |
| **Password Hashing** | Argon2id | `argon2.hash()` (Server-side) | Memory: 64MB, Iterations: 3, Parallelism: 1 |

---

## 3. Key Hierarchy & Architecture

```
                                    +-----------------------+
                                    | Long-Term Identity    |
                                    | Key (Ed25519/X25519)  |
                                    +-----------+-----------+
                                                | signs
                                                v
                                    +-----------------------+
                                    | Signed Pre-Key (SPK)  |
                                    |       (X25519)        |
                                    +-----------+-----------+
                                                |
         +--------------------------------------+--------------------------------------+
         |                                                                             |
         v                                                                             v
+-----------------------+                                                     +-----------------------+
| One-Time Pre-Keys     |                                                     | Ephemeral Key (EK)    |
| (OPK_1 ... OPK_n)     |                                                     | (Initiator X25519)    |
+-----------+-----------+                                                     +-----------+-----------+
            \                                                                             /
             \_________________________________   _______________________________________/
                                               \ /
                                                v
                                     +---------------------+
                                     |   X3DH Agreement    |
                                     |  DH1 + DH2 + DH3    |
                                     |     (+ DH4 OPK)     |
                                     +----------+----------+
                                                |
                                                v
                                     +---------------------+
                                     | Master Shared Secret|
                                     +----------+----------+
                                                |
                                                v
                                     +---------------------+
                                     | Symmetric Ratchet   |
                                     |   (Root / Chain)    |
                                     +----------+----------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
             +---------------------+                         +---------------------+
             |  Sending Chain Key  |                         | Receiving Chain Key |
             +----------+----------+                         +----------+----------+
                        |                                               |
                        v                                               v
             +---------------------+                         +---------------------+
             |     Message Key     |                         |     Message Key     |
             |  (Single-Use 32B)   |                         |  (Single-Use 32B)   |
             +---------------------+                         +---------------------+
```

### 3.1 Device Key Generation & Storage
On the initial launch of the application:
1. An **Identity Key Pair** is generated in the browser sandbox:
   - Signing Key: Ed25519 (`IK_sign`)
   - Encryption Key: X25519 (`IK_dh`), derived via birational mapping from `IK_sign`.
2. A medium-term **Signed Pre-Key** (`SPK`) is generated and signed with `IK_sign`:
   $$\text{Sig} = \text{Ed25519\_Sign}(IK_{sign}, SPK_{pub})$$
3. A pool of 20 **One-Time Pre-Keys** (`OPK_1` through `OPK_20`) are generated.
4. **Storage Boundary**: All private keys (`IK_priv`, `SPK_priv`, `OPK_priv`) are persisted exclusively in device IndexedDB (`editorial_crypto_keystore_v1`). Private keys **never** transit over HTTP, WebSocket, or any remote logging channel.
5. **Public Publishing**: Only public keys (`IK_dh_pub`, `SPK_pub`, `Sig`, `OPK_pub[]`) are uploaded to `POST /api/keys/bundle`.

---

## 4. Session Setup: Extended Triple Diffie-Hellman (X3DH)

When user Alice initiates a conversation with Bob:
1. Alice requests Bob's public pre-key bundle from `GET /api/keys/bundle/:bobId`.
2. Alice verifies Bob's `SPK` signature using Bob's `IK_sign_pub`:
   $$\text{crypto\_sign\_verify\_detached}(Bob.Sig, Bob.SPK_{pub}, Bob.IK_{sign\_pub}) == \text{true}$$
3. Alice generates a fresh ephemeral X25519 key pair $EK_A$.
4. Alice computes up to 4 Diffie-Hellman operations:
   $$DH_1 = \text{X25519}(Alice.IK_{dh\_priv}, Bob.SPK_{pub})$$
   $$DH_2 = \text{X25519}(Alice.EK_{priv}, Bob.IK_{dh\_pub})$$
   $$DH_3 = \text{X25519}(Alice.EK_{priv}, Bob.SPK_{pub})$$
   $$DH_4 = \text{X25519}(Alice.EK_{priv}, Bob.OPK_{pub}) \quad \text{(if OPK available)}$$
5. The master shared secret $SK$ is derived:
   $$SK = \text{HMAC-SHA512}(DH_1 \mathbin{\Vert} DH_2 \mathbin{\Vert} DH_3 \mathbin{\Vert} DH_4)$$
6. Alice includes her $EK_{pub}$ and the ID of Bob's consumed $OPK$ in the header of her first message. The server atomically deletes the consumed $OPK$ to prevent reuse.

---

## 5. Forward Secrecy & Symmetric Ratchet

Every message between Alice and Bob uses a dedicated, single-use message key $MK$ derived through an irreversible hash ratchet:

1. **Step Forward**:
   $$MK_i = \text{HMAC-SHA512}(CK_i, \text{"MessageKey"})$$
   $$CK_{i+1} = \text{HMAC-SHA512}(CK_i, \text{"ChainAdvance"})$$
2. **Encryption**:
   $$\text{Ciphertext}, \text{Tag} = \text{XChaCha20-Poly1305}(MK_i, Nonce_{24}, \text{Plaintext}, AD)$$
   where $AD$ is the Associated Data string:
   $$AD = \text{"senderId:"} + sender + \text{"|receiverId:"} + receiver + \text{"|timestamp:"} + timestamp$$
3. **Key Deletion**: Immediately after encryption/decryption, $MK_i$ is zeroed from memory. Prior messages cannot be decrypted even if $CK_{i+1}$ is later extracted.

---

## 6. Safety Numbers (Fingerprint Verification)

To detect active Man-in-the-Middle attacks (e.g. server substituting public keys), users can verify Safety Numbers out-of-band:

1. Identity public keys $IK_A$ and $IK_B$ are sorted lexicographically:
   $$(K_1, K_2) = \text{sort}(IK_A, IK_B)$$
2. A 64-byte cryptographic hash is computed:
   $$H = \text{SHA-512}(K_1 \mathbin{\Vert} K_2)$$
3. The digest is sliced into 12 chunks of 4 bytes. Each chunk is formatted as a 5-digit decimal integer ($00000$ to $99999$):
   $$\text{Group}_k = (\text{read\_uint32\_be}(H[k \times 4 : (k+1) \times 4]) \pmod{100000})$$
4. The resulting 60-digit number is rendered in 12 clean groups:
   ```
   31492  85710  49281  90124
   58192  03912  84719  29481
   71928  49102  38192  50192
   ```
5. Comparing this number in-person or via secure audio verifies that no entity has tampered with public keys.

---

## 7. Zero-Plaintext Storage & Verification

The server database enforces zero-plaintext visibility:
- **`Message.content`**: Stores Base64 ciphertext only.
- **`Message.nonce`**: Stores the 24-byte random initialization vector.
- **`PushSubscription`**: Push payloads contain only generic trigger metadata (`{"type":"new_message"}`), leaving APNs and FCM blind to message content.
- **Media Uploads**: Files sent to `/api/media/upload` are encrypted with an ephemeral XSalsa20 symmetric key on the client before leaving the device. The media encryption key is sent exclusively within the E2EE message stream.
