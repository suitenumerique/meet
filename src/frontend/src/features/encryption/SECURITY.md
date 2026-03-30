# Encryption Security Architecture

## Threat model

### What E2EE protects against
- **Server-side data access**: The LiveKit SFU and Meet backend cannot read audio/video content
- **Network interception**: Media frames are encrypted before leaving the client
- **Unauthorized participants**: Restricted access + lobby ensures only admin-approved users join

### Known limitations and mitigations

#### Compromised LiveKit server (MITM on key exchange)

**Threat**: If the LiveKit server is compromised, it could perform a Man-in-the-Middle attack on the ephemeral DH key exchange, intercepting the symmetric key.

**Current mitigation**: KEY_RESPONSE is only accepted from participants with `room_admin: "true"` in their server-signed JWT attributes. This prevents non-admin participants from injecting fake keys, but does not protect against a compromised server that can forge JWT attributes.

**Planned mitigations (3 levels):**

##### Level 1 — Signed key exchange (requires encryption onboarding)

When the admin has completed encryption onboarding via `data.encryption`:
1. Admin signs the KEY_RESPONSE with their permanent private key (stored in IndexedDB)
2. Receiving participant fetches admin's public key from `data.encryption` registry
3. Verifies the signature before accepting the symmetric key
4. If signature is invalid → **reject the key, show error, cut video**

This protects against server compromise because the server cannot forge the admin's private key signature.

**Requirement**: Admin must have completed encryption onboarding. If not, falls back to Level 2.

##### Level 2 — SAS (Short Authentication String) verification

After the ephemeral DH key exchange:
1. Both parties compute SAS = hash(DH_shared_secret) → displayed as 4 emojis or a 6-digit code
2. Each participant sees the SAS on their own screen (local rendering)
3. They read it aloud to each other during the call
4. If the SAS matches → the key exchange was not intercepted
5. If the SAS doesn't match → MITM detected → reject the key

This works because:
- A MITM results in different DH shared secrets → different SAS codes
- The SAS is rendered locally — the server cannot change what appears on screen
- Real-time audio manipulation to fake the spoken SAS is extremely difficult

**Requirement**: Participants must verbally compare the SAS. Optional but recommended.

##### Level 3 — Trust the server (current default)

Relies on the LiveKit server's integrity (JWT-signed attributes). Suitable when:
- The server infrastructure is self-hosted and trusted
- The threat model does not include server compromise
- Quick, frictionless meetings are prioritized over maximum security

#### Key propagation without admin

**Current behavior**: Any participant who has the symmetric key can relay it to new joiners.

**Risk**: If the server is compromised, it could inject a fake participant who relays a compromised key.

**Planned fix**: Only accept KEY_RESPONSE from participants whose identity can be:
- Cryptographically verified (Level 1 — signature from registered public key), or
- Manually verified (Level 2 — SAS comparison)

Non-verified key relays should show a clear warning.

## Trust levels

| Level | Badge | Identity verification | Key exchange | Server compromise protection |
|-------|-------|----------------------|-------------|------------------------------|
| Verified | 🟢 Green shield | Public key registered in `data.encryption` | Signed with permanent private key | Yes — signature cannot be forged |
| Authenticated | 🔵 Blue shield | OIDC/ProConnect login | Ephemeral DH (unsigned) | No — relies on server integrity |
| Anonymous | 🟡 Orange warning | None (self-declared name) | Ephemeral DH (unsigned) | No — relies on server integrity |

## Implementation status

- [x] LiveKit E2EE with insertable streams
- [x] Ephemeral X25519 DH key exchange (libsodium)
- [x] Admin as key authority
- [x] Server-signed trust attributes in JWT
- [x] Trust badges (verified/authenticated/anonymous)
- [x] Fingerprint verification dialog
- [x] Encryption settings in account menu (VaultClient onboarding)
- [ ] Signed KEY_RESPONSE (Level 1)
- [ ] SAS verification (Level 2)
- [ ] Restrict key propagation to verified participants only
- [ ] Disable recording/transcription UI for encrypted rooms
