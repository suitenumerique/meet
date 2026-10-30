# Security

Harden the Meet server you run, and learn how Meet itself protects its API and signs users in. How calls are encrypted is in [Is it secure?](../overview/how-meet-works.md#security).

## Infrastructure hardening

### TLS

- Add no HSTS header at the reverse proxy: the `Production` configuration already sends `Strict-Transport-Security: max-age=60; includeSubDomains; preload`, and browsers would receive two.
- Disable TLS 1.0 and 1.1. With nginx-proxy, set `ssl_protocols TLSv1.2 TLSv1.3;` in a custom nginx config. With Traefik, add to your Traefik configuration:
  ```yaml
  tls:
    options:
      default:
        minVersion: VersionTLS12
  ```

### Database and object storage

Never expose PostgreSQL's port or the storage's ports publicly, as [Never public](../self-hosting/configuration/firewall.md#never-public) lists. Recording downloads go through `/media/` on the reverse proxy instead.

### Kubernetes

The Helm chart can meet the `restricted` Pod Security Standard, but sets nothing by default: set it for each component, see [Helm: Security context](../self-hosting/kubernetes/helm.md#security-context-recommended).

## API security

### CSRF protection

The Django backend checks CSRF tokens on browser requests that change data. [`DJANGO_CSRF_TRUSTED_ORIGINS`](env-variables.md#DJANGO_CSRF_TRUSTED_ORIGINS) lists the other domains allowed to post.

### Object-level permissions

- Anyone may read a room's details, signed in or not; its owners and administrators change it, and only its owners delete it.
- A deleted room keeps its link until the [room purge](../self-hosting/configuration/room-purge.md) removes it, so nobody can take it over meanwhile.
- [`ALLOW_UNREGISTERED_ROOMS`](env-variables.md#ALLOW_UNREGISTERED_ROOMS) decides what a room code that matches no room returns, see [Unauthenticated access](../self-hosting/configuration/sso.md#unauthenticated-access).

### Rate limiting

Meet throttles only these actions; limit every other endpoint at your reverse proxy.

| Action | Setting |
|---|---|
| Creating a room through `/api/v1.0/rooms/` | [`ROOM_CREATION_THROTTLE_RATES`](env-variables.md#ROOM_CREATION_THROTTLE_RATES), and [`ROOM_CREATION_DAILY_THROTTLE_RATES`](env-variables.md#ROOM_CREATION_DAILY_THROTTLE_RATES) over a day |
| Starting a recording | [`START_RECORDING_THROTTLE_RATES`](env-variables.md#START_RECORDING_THROTTLE_RATES), and [`START_RECORDING_DAILY_THROTTLE_RATES`](env-variables.md#START_RECORDING_DAILY_THROTTLE_RATES) over a day |
| Requesting entry from the waiting room | [`REQUEST_ENTRY_THROTTLE_RATES`](env-variables.md#REQUEST_ENTRY_THROTTLE_RATES) |
| Reading a room creation callback | [`CREATION_CALLBACK_THROTTLE_RATES`](env-variables.md#CREATION_CALLBACK_THROTTLE_RATES) |
| Starting a connection test | [`CONNECTION_TEST_THROTTLE_RATES`](env-variables.md#CONNECTION_TEST_THROTTLE_RATES) |
| A Roomkit join | [`ROOMKIT_JOIN_THROTTLE_RATES`](env-variables.md#ROOMKIT_JOIN_THROTTLE_RATES) |
| Exchanging a transit code for a user access token | [`EXCHANGE_ACCESS_TOKEN_THROTTLE_RATES`](env-variables.md#EXCHANGE_ACCESS_TOKEN_THROTTLE_RATES) |

- A signed-in caller is counted by account, anyone else by client address, read from `X-Forwarded-For` as [`NUM_PROXIES`](env-variables.md#NUM_PROXIES) sets. Reading a room creation callback and exchanging a transit code count anonymous callers only.
- An anonymous waiting-room request is counted by participant, not by address, from its second request on.

### Audit logging

The backend writes an audit event for each sign-in, each room action made through the external API, each recording action, and each Django admin change, see [Audit logging](../self-hosting/configuration/audit-logging.md).

## Authentication model

Users sign in through an external [OIDC](https://openid.net/developers/how-connect-works/) provider, such as Keycloak, Authentik or Google, and have no password in Meet. Django admin passwords and application secrets are stored hashed.

Clients join LiveKit with the pass that [What happens when someone joins?](../overview/how-meet-works.md#joining-a-meeting) describes. The backend signs it with [`LIVEKIT_API_SECRET`](env-variables.md#LIVEKIT_API_SECRET).

## Vulnerabilities

Fixed ones are in [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) and the [GitHub Security Advisories](https://github.com/suitenumerique/meet/security/advisories). Report a new one privately, never in a public issue: see [Reporting a vulnerability](../index.md#reporting-a-vulnerability).
