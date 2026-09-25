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
| `restricted` | Only participants explicitly trusted by the owner | Everyone else, authenticated or not |


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

Reading a room requires no authentication or membership - anyone with the slug/PIN can join. Modifying or deleting a room requires being an administrator or owner.

By default (`ALLOW_UNREGISTERED_ROOMS=True`), joining a slug that doesn't exist yet creates the room on the fly instead of returning `404`. Set `ALLOW_UNREGISTERED_ROOMS=False` to require rooms to be explicitly created first.

### Rate limiting

API endpoints are rate-limited per authenticated user. The lobby endpoint uses participant-ID-based throttling. Rate limit failures can be tracked via Sentry (`DJANGO_SENTRY_DSN`).


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

The backend and frontend images run as non-root users. Avoid exposing `/var/run/docker.sock` in production (your reverse proxy requires it for container auto-discovery; scope access carefully).

### Kubernetes

The Meet Helm chart supports full `restricted` Pod Security Standards as of v1.14.0. These must be configured per-component:

```yaml
backend:
  podSecurityContext:
    runAsNonRoot: true
  securityContext:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: [ALL]

# Repeat for: frontend, summary, celeryBackend, celeryTranscribe,
# celerySummarize, celerySummaryBackend, agentMetadata, agentSubtitles
```

See [Helm deployment security context](../self-hosting/kubernetes/helm.md#security-context-recommended) for full configuration.


## Reporting vulnerabilities

See [SECURITY.md](https://github.com/suitenumerique/meet/blob/main/SECURITY.md) for the responsible disclosure policy.

Report vulnerabilities privately to: `visio@numerique.gouv.fr`

Do not open public GitHub issues for security vulnerabilities.
