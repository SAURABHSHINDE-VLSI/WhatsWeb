# Cryptographic Protocol Decision: X3DH & Double Ratchet

## Executive Summary

To achieve genuine end-to-end encryption with Forward Secrecy (FS) and Post-Compromise Security (PCS) in a browser PWA, we evaluated candidate implementations of the Extended Triple Diffie-Hellman (X3DH) and Double Ratchet protocols.

This document reviews candidate libraries, justifies our architecture choice, and documents the protocol specifications, maintenance status, licenses, and security properties.

---

## 1. Candidate Evaluation

### Candidate A: `@matrix-org/olm` (libolm WASM bindings)
- **Protocol**: Olm (Matrix variant of Double Ratchet & X3DH).
- **License**: Apache-2.0.
- **Maintenance Status**: **Deprecated**. Formally deprecated by the Matrix.org Foundation in 2023 in favor of Vodozemac (Rust).
- **Known Audits**: NCC Group (2016). No recent audits since 2016.
- **Browser/PWA Support**: Requires loading an asynchronous `olm.wasm` binary file outside the JS bundle, creating MIME-type and asset resolution issues in Service Worker / offline PWA contexts.

### Candidate B: `vodozemac` (Matrix Rust implementation)
- **Protocol**: Olm / Megolm / Double Ratchet in Rust.
- **License**: Apache-2.0.
- **Maintenance Status**: Actively maintained by Matrix.org.
- **Known Audits**: Formally audited by Least Authority in 2022.
- **Browser/PWA Support**: Distributed via `crates.io` for Rust. No official, stable standalone NPM package exists for direct browser packaging without custom wasm-pack pipelines.

### Candidate C: `@signalapp/libsignal-client` & `@privacyresearch/libsignal-protocol-typescript`
- **Protocol**: Signal Protocol (X3DH + Double Ratchet).
- **License**: GPL-3.0-only (restrictive copyleft).
- **Maintenance Status**: The TypeScript port is maintained by community volunteers and has not been updated since early 2023. Official Signal client is Rust/N-API for mobile/desktop, with no out-of-the-box browser bundle.
- **Known Audits**: Formal security proofs by Cohn-Gordon et al. (IEEE S&P 2017).

### Candidate D: Specification-Conforming Implementation using `libsodium-wrappers`
- **Protocol**: Exact Signal X3DH Specification (Revision 1) + Signal Double Ratchet Specification (Revision 1).
- **Cryptographic Primitives**: `libsodium-wrappers` (NaCl / libsodium):
  - Curve25519 (X25519) for Diffie-Hellman key agreement (`crypto_scalarmult`).
  - Ed25519 for Identity Key digital signatures (`crypto_sign_detached`, `crypto_sign_verify_detached`).
  - HKDF-SHA256 (`crypto_auth_hmacsha256`) for KDF chains using official Signal labels (`WhisperRatchet`, `WhisperMessageKeys`).
  - XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf`) for authenticated message encryption with 24-byte random nonces.
- **License**: ISC (libsodium) / Apache-2.0 / MIT.
- **Maintenance Status**: Actively maintained, constant-time assembly & WebAssembly builds, trusted by thousands of production systems worldwide.
- **Browser/PWA Support**: Seamlessly compiles to self-contained WebAssembly with no separate WASM fetch step or CDN dependencies.

---

## 2. Decision & Justification

We selected **Candidate D**: conforming strictly to the **Signal X3DH and Double Ratchet specifications**, executed with vetted, audited **libsodium** primitives (`libsodium-wrappers`).

### Why this choice?
1. **Adherence to Spec**: We use the exact Signal KDF labels, ratchet state machine, and test vectors. No hand-rolled ratchets or proprietary KDF constants.
2. **Reliability in Offline PWA**: `libsodium-wrappers` initializes synchronously with compiled WebAssembly without failing when offline or behind a strict Service Worker CSP.
3. **Audit Foundation**: Libsodium has undergone continuous third-party audits (including Private Internet Access audit by Cure53).
4. **Clean License**: ISC / MIT allows distribution without GPL entanglement.

---

## 3. Protocol Architecture

### 3.1 X3DH Key Agreement
To establish a session with Bob:
- Alice fetches Bob's Pre-Key Bundle:
  - Identity Key ($IK_B$, Ed25519 public key and derived Curve25519 key).
  - Signed Pre-Key ($SPK_B$, Curve25519 public key).
  - Signature over $SPK_B$ with $IK_B$ ($Sig_B$).
  - One-Time Pre-Key ($OPK_B$, optional Curve25519 public key).
- **Signature Verification**: Alice verifies $Sig_B$ using Bob's Ed25519 public identity key. If verification fails, the connection is aborted immediately.
- Alice generates an Ephemeral Keypair ($EK_A$).
- Alice computes:
  - $DH1 = \text{X25519}(IK_A, SPK_B)$
  - $DH2 = \text{X25519}(EK_A, IK_B)$
  - $DH3 = \text{X25519}(EK_A, SPK_B)$
  - $DH4 = \text{X25519}(EK_A, OPK_B)$ (if OPK present)
- $SK = \text{HKDF}(DH1 \mathbin{\Vert} DH2 \mathbin{\Vert} DH3 \mathbin{\Vert} DH4, \text{"WhisperRatchet"})$

### 3.2 Double Ratchet
Every session maintains:
- **DH Ratchet**: Asymmetric ratchet using Curve25519 key exchanges on each conversational turn.
- **Symmetric Ratchets**: Sending chain and receiving chain updated via HKDF on each message.
- **Skipped Message Keys**: Kept in memory/storage with a strict limit (maximum 1,000 keys) to handle out-of-order and dropped packets without breaking session continuity.
- **Zeroing**: Message keys are cryptographically wiped from memory immediately after decryption.

### 3.3 Safety Numbers
Derived by computing SHA-512 over sorted identity keys:
- 12 blocks of 5 decimal digits (60 digits total).
- Visual QR code representation.
- Changes in safety number trigger an explicit warning and block sending until confirmed by user.
