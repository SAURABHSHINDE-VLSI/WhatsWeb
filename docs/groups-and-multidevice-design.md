# Architecture & Cryptographic Design: Groups & Multi-Device Linked Sessions

**Document Status**: Proposed Architectural Design  
**Author**: WhatsUs Engineering Team  
**Scope**: In-depth cryptographic evaluation of **IETF MLS (RFC 9420)** vs. **Signal Sender Keys** for future WhatsUs group chats and multi-device linked sessions.

---

## 1. Executive Summary

WhatsUs currently operates on a strict **1:1 pairwise E2EE model** using the **Signal X3DH (Extended Triple Diffie-Hellman)** key agreement and the **Double Ratchet protocol** over libsodium primitives.

To extend WhatsUs to:
1. **Group conversations** (3 to 1,000 members), and
2. **Multi-device linked sessions** (companion web, desktop, and tablet clients paired with a primary mobile device),

we must transition from pure pairwise Double Ratchet channels to an architecture that scales without exponential compute or bandwidth costs.

This design document compares the two industry-standard paradigms:
- **IETF RFC 9420: Messaging Layer Security (MLS)** (TreeKEM continuous group key agreement), and
- **Signal Sender Keys** (pairwise distribution of symmetric ratchet chains).

### Recommendation Summary
| Metric | Signal Sender Keys | IETF MLS (RFC 9420) | Recommended Choice for WhatsUs |
| :--- | :--- | :--- | :--- |
| **Cryptographic Primitive** | Symmetric KDF Chain + Pairwise Double Ratchet | TreeKEM Binary Ratchet Tree | **MLS for Groups > 50; Sender Keys for 1:N fan-out** |
| **Send Complexity** | $\mathcal{O}(1)$ symmetric encryption | $\mathcal{O}(1)$ symmetric encryption | Tie |
| **Member Join/Leave Cost** | $\mathcal{O}(N)$ re-distribution | $\mathcal{O}(\log N)$ TreeKEM update | **MLS** |
| **Post-Compromise Security (PCS)** | Weak (requires pairwise ratchet rotation) | Strong (continuous epoch ratchets $\mathcal{O}(\log N)$) | **MLS** |
| **Forward Secrecy (FS)** | Strong (immediate ratchet step) | Strong (epoch key deletion) | Tie |
| **Multi-Device Pairing** | Device-as-Member Fanout | Device Subtree in TreeKEM | **Signal Multi-Device (Pairwise Identity)** |
| **Browser WASM Readiness** | Mature (`@signalapp/libsignal-client`) | Emerging (OpenMLS compiled to WASM) | **Sender Keys (v2 interim) $\to$ OpenMLS (v3)** |
| **License / Maintenance** | AGPLv3 (`libsignal-client`) | Apache 2.0 / MIT (OpenMLS) | **OpenMLS (Apache 2.0)** |

---

## 2. Comparative Cryptographic Analysis

### 2.1 Signal Sender Keys

#### How It Works
1. Each group member generates a random **Chain Key** and a **Signing Keypair** (Ed25519).
2. The sender transmits their **Sender Key Distribution Message (SKDM)** to all group members using existing **1:1 pairwise Double Ratchet sessions**.
3. When sending a group message:
   - The sender advances their symmetric KDF ratchet by one step, deriving a single-use 32-byte message key.
   - The sender encrypts the plaintext once with AES-GCM or XChaCha20-Poly1305.
   - The sender signs the ciphertext with their Ed25519 signing key.
   - The server fans out the identical ciphertext to all $N-1$ recipients ($\mathcal{O}(1)$ client compute).
4. When a member leaves or is removed:
   - The sender must discard their chain key and distribute a brand-new SKDM to the remaining $N-2$ members via $N-2$ pairwise Double Ratchet messages.

#### Strengths
- **Low Overhead for Stable Groups**: Sending a message costs only a single symmetric operation.
- **Immediate Deployment**: Reuses the exact pairwise Double Ratchet primitives already implemented in WhatsUs.
- **Zero Tree State in IndexedDB**: Clients only store $N$ sender chain keys (a few kilobytes).

#### Weaknesses
- **Poor Post-Compromise Security (PCS)**: If a sender's ratchet state is leaked, future messages by that sender are compromised until a new SKDM is distributed.
- **$\mathcal{O}(N)$ Rekeys on Membership Change**: Removing a member from a 500-person group requires every sender to distribute fresh keys to 499 members, causing a massive $\mathcal{O}(N^2)$ message storm.
- **Server Dependency for Transcript Ordering**: Senders cannot detect if the server drops or reorders messages from different participants without a server-sequenced causal tree.

---

### 2.2 IETF MLS (Messaging Layer Security - RFC 9420)

#### How It Works
1. Groups are structured as a left-balanced binary tree (TreeKEM).
2. Each leaf represents a group member (or individual device). Each non-leaf node represents an intermediate keypair.
3. Every member knows the private keys on the direct path from their leaf node to the root. The root key is the current group secret.
4. **Member Addition / Removal / Update**:
   - The actor generates fresh ephemeral keys along their direct path up to the root.
   - The actor encrypts the path secrets to the copath nodes ($\mathcal{O}(\log N)$ ciphertexts).
   - All remaining members can compute the new root secret in $\mathcal{O}(\log N)$ operations.
5. **Continuous Post-Compromise Security**:
   - Members periodically send `Commit` messages containing fresh entropy (an "update"), actively healing the group state in $\mathcal{O}(\log N)$ without resetting pairwise channels.

#### Strengths
- **True $\mathcal{O}(\log N)$ Scaling**: Groups scale efficiently up to tens of thousands of members.
- **Strict Post-Compromise Security (PCS)**: Compromising a client state is healed as soon as any active participant issues a Commit.
- **Standardized RFC**: RFC 9420 is an open Internet standard developed by the IETF with formal academic verification.
- **Permissive Open-Source Implementations**: OpenMLS is dual-licensed under Apache 2.0 / MIT, avoiding AGPL copyleft contamination.

#### Weaknesses
- **Tree State Synchronization & Commits**: MLS requires synchronous epoch transitions. If Alice and Bob submit a `Commit` simultaneously, the Delivery Service (DS) must order them; the losing Commit must be aborted and rebased.
- **Browser State Size**: Storing the ratcheting tree in IndexedDB requires careful transactional persistence to survive sudden tab closures.
- **WASM Footprint**: Compiling OpenMLS to WASM with Rust requires approximately 350-450 KB of WASM code.

---

## 3. Multi-Device Linked Sessions Architecture

Multi-device support requires that Alice’s messages synchronize across her phone, web client, and tablet without compromising end-to-end security.

### 3.1 Architecture Options

#### Option A: Independent Member Fanout (Signal Model)
- Each registered device has its own Identity Key, Pre-Key bundles, and Double Ratchet state.
- Bob sees Alice not as 1 endpoint, but as a set of active devices $\{A_1, A_2, A_3\}$.
- When Bob sends a message to Alice, his client performs pairwise encryption to $A_1$, $A_2$, and $A_3$ individually.
- When Alice sends a message from $A_1$, she also sends an encrypted sync message to $A_2$ and $A_3$.

**Evaluation for WhatsUs**:
- **Pros**: Perfectly preserves existing 1:1 crypto protocol. No new group abstraction needed for 1:1 chat.
- **Cons**: Bandwidth multiplies by the number of recipient devices. Pairing a new device requires an out-of-band mutual device verification handshake.

#### Option B: Device Group Subtree in MLS
- Each user's collection of devices forms a local sub-group, or is mapped directly into leaf nodes in an MLS conversation.
- A user's device group acts as a virtual participant.

**Evaluation for WhatsUs**:
- **Pros**: Bandwidth scales logarithmically even as users add multiple devices.
- **Cons**: Excessive complexity for simple 1:1 chats.

### 3.2 Recommended Multi-Device Pairing Workflow for WhatsUs
1. **Primary Device Authority**: The mobile app (or initial web session) holds the master account keypair.
2. **QR Code Handshake**:
   - Secondary client generates an ephemeral X25519 keypair and renders a QR code.
   - Primary client scans the QR code, establishes a temporary authenticated P2P channel, and transmits the wrapped account credentials.
3. **Safety Number Representation**:
   - Safety numbers should represent the *Account Identity Key*, with sub-device keys signed by the primary identity key.

---

## 4. Implementation & Migration Roadmap for WhatsUs

### Phase 1: High-Performance Multi-Device (Interim)
- Keep 1:1 Double Ratchet protocol intact.
- Add multi-device device discovery to `/api/keys/devices`.
- Client encrypts to all active device targets for a recipient (capped at 5 devices per user).

### Phase 2: OpenMLS Integration for Group Chats
- Integrate **OpenMLS** (Rust compiled to `wasm32-unknown-unknown`) as an isolated Web Worker (`mls.worker.ts`).
- Server provides a pure Delivery Service (DS) role:
  - Sequences proposals and commits with monotonic epoch counters.
  - Fans out epoch ciphertexts.
  - Zero server visibility into group membership keys.
- Store serialized MLS tree state in IndexedDB with atomic versioning.

---

## 5. Security & Privacy Guarantees

1. **Zero Delivery Service Plaintext**: The server never sees TreeKEM path secrets or message keys.
2. **Metadata Protections**: MLS encrypts group metadata (including member identity add/remove proposals) inside private group messages. The Delivery Service observes only client pseudo-IDs and epoch counters.
3. **Epoch Replay Protection**: Any commit referencing a stale epoch is rejected by the Delivery Service, preventing split-brain tree state.
