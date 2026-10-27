# Security

## Authentication model

### No user passwords in Meet

Users sign in through an external OIDC provider, such as Keycloak, Authentik or Google, and have no password in Meet. Django admin passwords and application secrets are stored hashed.

### LiveKit JWT tokens

Clients join the LiveKit media server with a JWT:

- The backend signs it with `LIVEKIT_API_SECRET`.
- It carries the user's identity, the room name and the user's permissions in the room.
- It is valid for 6 hours.
- Anyone holding `LIVEKIT_API_SECRET` can forge tokens for your LiveKit server: if it leaks, rotate it immediately.

### Room access levels

| `access_level` | Who joins directly | Who waits in the lobby |
|---|---|---|
| `public` | Anyone with the room link | No one |
| `trusted` | Authenticated users | Unauthenticated users |
| `restricted` | People holding a role on the room (owner, administrator, member) | Everyone else, authenticated or not |


## Media encryption

### Transport encryption (DTLS-SRTP)

All WebRTC media is encrypted in transit with DTLS-SRTP, which browsers enforce.

This is **transport encryption** only, and Meet has no end-to-end encryption. LiveKit, an SFU (Selective Forwarding Unit) that forwards each participant's stream to the others, decrypts and re-encrypts media to forward it, so whoever runs the server can access the media.


## API security

### CSRF protection

The Django backend checks CSRF tokens on browser requests that change data. Meet's own domain needs no setting; `DJANGO_CSRF_TRUSTED_ORIGINS` lists any other domain allowed to post to it.

### Object-level permissions

- Reading a room requires no sign-in and no role.
- Modifying a room requires being its administrator or owner, and deleting it requires being its owner.
- A deleted room keeps its link until the [room purge](../self-hosting/configuration/room-purge.md) removes it, so nobody can take it over meanwhile.

`ALLOW_UNREGISTERED_ROOMS` decides what a slug that matches no room returns, see [Unauthenticated access](../self-hosting/configuration/sso.md#unauthenticated-access).

### Rate limiting

Only these actions are throttled. Every other endpoint has no limit: set one at your reverse proxy.

| Action | Setting | Default |
|---|---|---|
| Creating a room through `/api/v1.0/rooms/` | `ROOM_CREATION_THROTTLE_RATES` | `50/minute` |
| The same, over a day | `ROOM_CREATION_DAILY_THROTTLE_RATES` | `1000/day` |
| Starting a recording | `START_RECORDING_THROTTLE_RATES` | `10/minute` |
| The same, over a day | `START_RECORDING_DAILY_THROTTLE_RATES` | `100/day` |
| Requesting entry from the waiting room | `REQUEST_ENTRY_THROTTLE_RATES` | `150/minute` |
| Reading a room creation callback | `CREATION_CALLBACK_THROTTLE_RATES` | `600/minute` |
| Starting a connection test | `CONNECTION_TEST_THROTTLE_RATES` | `30/minute` |
| A Roomkit join | `ROOMKIT_JOIN_THROTTLE_RATES` | `300/minute` |
| Exchanging a transit code for a user access token | `EXCHANGE_ACCESS_TOKEN_THROTTLE_RATES` | `30/minute` |

- A signed-in caller is counted by account, anyone else by client address, read from `X-Forwarded-For` as [`NUM_PROXIES`](env-variables.md#core) sets. Reading a room creation callback and exchanging a transit code count anonymous callers only.
- An anonymous waiting-room request is the exception: it is counted by the participant id its first request received, so counting starts with its second request.

### Audit logging

The backend writes an audit event for each sign-in, each room or recording action, and each Django admin change, see [Audit logging](../self-hosting/configuration/audit-logging.md).


## Known security fixes

See [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) and [GitHub Security Advisories](https://github.com/suitenumerique/meet/security/advisories).


## Infrastructure hardening

### Django secret key

Generate [`DJANGO_SECRET_KEY`](env-variables.md#core):

```bash
openssl rand -hex 50
```

Rotate it immediately if it leaks; rotating it invalidates every active session.

### LiveKit API secret

Generate [`LIVEKIT_API_SECRET`](env-variables.md#livekit):

```bash
openssl rand -hex 32
```

Keep it at 32 characters or more, and guard it like a database password.

### TLS

- Use Let's Encrypt certificates, which the reverse proxy obtains automatically, or certificates from a commercial CA.
- The `Production` configuration already sends `Strict-Transport-Security: max-age=60; includeSubDomains; preload`. A reverse proxy adding its own HSTS header on top makes browsers receive two.
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

### Object storage (S3)

- Do not expose the storage's ports publicly. Recording downloads go through `/media/` on the reverse proxy instead.
- Limit Meet's storage credentials to its own buckets, with an access policy (IAM-style).

### Docker

- The backend and frontend images run as non-root users.
- Mount `/var/run/docker.sock` read-only, and only in the reverse proxy, which needs it to discover containers.

### Kubernetes

Since Meet v1.14.0, the Helm chart can meet the `restricted` Pod Security Standard. Nothing is set by default: set it for each component, see [Helm: Security context](../self-hosting/kubernetes/helm.md#security-context-recommended).


## Reporting vulnerabilities

Report them privately, never in a public issue: see [Reporting a vulnerability](../index.md#reporting-a-vulnerability).
