# Security

## Authentication model

### No passwords stored in Meet

Meet does not manage passwords. All authentication is fully delegated to an external OIDC provider (Keycloak, Authentik, Google, etc.). Compromising the Meet database does not expose user credentials.

### LiveKit JWT tokens

Clients authenticate with the LiveKit media server using JWTs:
- Signed by the Django backend using `LIVEKIT_API_SECRET`
- Encode: user identity, room name, and permissions
- TTL: 6 hours
- If `LIVEKIT_API_SECRET` is compromised, anyone can forge tokens for your LiveKit server; rotate it immediately

### Room access levels

| `access_level` | Who joins directly | Who waits in the lobby |
|---|---|---|
| `public` | Anyone with the room link | No one |
| `trusted` | Authenticated users | Unauthenticated users |
| `restricted` | People holding a role on the room (owner, administrator, member) | Everyone else, authenticated or not |


## Media encryption

### Transport encryption (DTLS-SRTP)

All WebRTC media is encrypted in transit using DTLS-SRTP. This is mandatory and enforced by all browsers; it cannot be disabled.

This is **transport encryption**: the LiveKit SFU decrypts and re-encrypts media to forward it. The server operator can theoretically see media content.

### End-to-end encryption

True E2EE (where even the server cannot decrypt) is in development. When available, it will use WebRTC Insertable Streams / Encoded Transform API.


## API security

### Input validation

All API endpoints apply strict input validation. Enhanced validation was added in v1.10.0 to prevent injection and abuse.

### CSRF protection

The Django backend uses CSRF tokens for browser-based requests. `DJANGO_CSRF_TRUSTED_ORIGINS` must include your exact HTTPS domain.

### Object-level permissions

Reading a room requires no authentication or membership. In a browser, joining it depends on its access level: anyone with the slug joins a `public` room, signed-in users join a `trusted` room, people holding a role on the room join a `restricted` one, and everyone else goes through the waiting room. Modifying or deleting a room requires being an administrator or owner.

`ALLOW_UNREGISTERED_ROOMS` decides what a slug that matches no room returns, see [Unauthenticated access](../self-hosting/configuration/sso.md#unauthenticated-access).

### Rate limiting

Four actions are throttled, each by its own setting: requesting entry from the waiting room (`REQUEST_ENTRY_THROTTLE_RATES`), room creation callbacks (`CREATION_CALLBACK_THROTTLE_RATES`), connection tests (`CONNECTION_TEST_THROTTLE_RATES`) and Roomkit joins (`ROOMKIT_JOIN_THROTTLE_RATES`). Every other endpoint has no limit: set one at your reverse proxy.


## Known security fixes

See [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) and [GitHub Security Advisories](https://github.com/suitenumerique/meet/security/advisories).

Always keep your instance up to date.


## Infrastructure hardening

### Django secret key

```bash
openssl rand -hex 50
```
Rotate immediately if compromised; this invalidates all active sessions.

### LiveKit API secret

```bash
openssl rand -hex 32
```
Keep at 32+ characters. Treat like a database password.

### TLS

- Use Let's Encrypt or a commercial CA. Your reverse proxy handles certificate issuance automatically
- Enable HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Disable TLS 1.0/1.1. With nginx-proxy, set `ssl_protocols TLSv1.2 TLSv1.3;` in a custom nginx config. With Traefik, add to your Traefik configuration:
  ```yaml
  tls:
    options:
      default:
        minVersion: VersionTLS12
  ```

### Database

- Use a strong, unique password for PostgreSQL
- Never expose port 5432 publicly
- Use TLS if the database is on a separate host

### Object storage (MinIO/S3)

- Do not expose MinIO/S3 ports publicly. Recording downloads go through `/media/` on the reverse proxy instead.
- Use IAM-style policies to limit access to specific buckets
- Recording completion is detected via LiveKit Server's own signed `egress_ended` webhook (verified with `LIVEKIT_API_SECRET`, same as other LiveKit webhooks).

### Docker

The backend and frontend images run as non-root users. Only the reverse proxy should mount `/var/run/docker.sock`, which it needs to discover containers; mount it read-only and give no other container access.

### Kubernetes

The Meet Helm chart supports full `restricted` Pod Security Standards as of v1.14.0. These must be configured per-component, see [Helm deployment security context](../self-hosting/kubernetes/helm.md#security-context-recommended).


## Reporting vulnerabilities

See [SECURITY.md](https://github.com/suitenumerique/meet/blob/main/SECURITY.md) for the responsible disclosure policy.

Report vulnerabilities privately to: `visio@numerique.gouv.fr`

Do not open public GitHub issues for security vulnerabilities.
