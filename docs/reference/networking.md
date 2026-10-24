# Networking

## Ports

Which ports to open, and which never to expose, are in [Firewall & Ports](../self-hosting/configuration/firewall.md), with the firewall rules for every configuration.

## Traffic flow

### Web request (browser → Meet UI)

```
Browser :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → /api, /admin, /static, /external-api → backend :8000 (Django)
    → /*                                   → frontend :8080 (React SPA)
```

Add-ons, the Outlook add-in for one, are served under `/api/v1.0/addons/*`, which the `/api` rule already covers.

### External API

```
Your application :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → /external-api/* → backend :8000 (Django)
```

It answers only when the backend sets `EXTERNAL_API_ENABLED=True`, see [External API](external-api.md). `/external-api` is a top-level path of its own, so the `/api` rule does not cover it: it needs its own nginx location block.

### OIDC login

```
Browser → meet.example.com/api/v1.0/authenticate/
  → backend :8000 → redirect to auth.example.com :443
  → Keycloak login form
  → redirect to meet.example.com/api/v1.0/callback/
  → backend :8000 (code exchange with auth.example.com, at its public address)
  → browser receives session cookie
```

### LiveKit WebSocket (signaling)

```
Browser → https://livekit.example.com :443 /rtc
  → reverse proxy (TLS termination, WebSocket upgrade)
  → livekit container :7880 (plain WebSocket)
```

`/rtc` is LiveKit's signaling path. The LiveKit client library appends it on its own when it connects.

### LiveKit media (audio/video)

Media goes straight between each browser and LiveKit, without the reverse proxy:

```
Participant A browser
  │ WebSocket (TCP 443) → reverse proxy → livekit:7880
  │ RTP/RTCP  (UDP 7882) ────────────────► livekit:7882  (direct, no proxy)
  │
  ▼
LiveKit server (SFU: forwards each stream, does not transcode)
  │ RTP/RTCP  (UDP 7882) ────────────────► Participant B browser
```

When a participant's network blocks that UDP port, the browser falls back to TCP, then to a [TURN relay](../self-hosting/configuration/livekit.md#turn) if one is enabled. How it picks is in [LiveKit & TURN](../self-hosting/configuration/livekit.md#how-media-connects), and every port is in [Firewall & Ports](../self-hosting/configuration/firewall.md). On a cloud server, whose public IP is not on its network interface, LiveKit needs [`use_external_ip`](../self-hosting/configuration/livekit.md#use_external_ip) to announce that IP.

### LiveKit webhook (room, egress, and recording events)

```
LiveKit Server → POST https://meet.example.com/api/v1.0/rooms/webhooks-livekit/
```

## Docker networks

Meet uses two Docker networks:

| Network | Type | Members | Purpose |
|---|---|---|---|
| `proxy` | Bridge (external) | reverse proxy, frontend, livekit, keycloak | reverse proxy routing and TLS |
| `internal` | Bridge, one per stack | Meet stack: backend, frontend, celery, postgresql, redis, livekit; Keycloak stack: keycloak, kc-postgresql | Service-to-service communication |

Object storage is not part of the Meet stack. The Garage example's own compose file, [`docs/examples/garage/compose.yml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/garage/compose.yml), joins the Meet stack's `internal` network, which it names `meet_internal` unless `MEET_INTERNAL_NETWORK` says otherwise.

## Internal DNS resolution

Docker resolves names within a network, so services reach each other by service name. The backend is the exception for LiveKit: it calls LiveKit's public URL.

| From | To | Address |
|---|---|---|
| backend | postgresql | `postgresql:5432` |
| backend | redis | `redis:6379` |
| backend | livekit (API) | `https://livekit.example.com` |
| frontend nginx | backend | `backend:8000` |
| frontend nginx | frontend SPA | `frontend:8080` |
| livekit | redis | `redis:6379` |
