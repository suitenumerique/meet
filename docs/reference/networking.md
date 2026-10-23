# Networking

## Ports

Which ports to open, and which never to expose, are in [Firewall & Ports](../self-hosting/configuration/firewall.md), with the firewall rules for every configuration.

## Traffic flow

### Web request (browser → Meet UI)

```
Browser :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → /api/* → backend :8000 (Django)
    → /*     → frontend :8080 (React SPA)
```

Add-ons (calendar integrations) are served under `/api/v1.0/addons/*` - no separate route needed, they're already covered by the `/api/*` rule above.

### External API (server-to-server)

```
Your application :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → /external-api/* → backend :8000 (Django)
```

Only reachable when `EXTERNAL_API_ENABLED=True` on the backend - see [Application-Delegated](external-api-delegated.md) or [Resource Server](external-api-resource-server.md) for the authentication modes. Needs its own nginx location block (a separate top-level path from `/api/*`).

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

`/rtc` is LiveKit's signaling endpoint path; the LiveKit client SDK appends it automatically when connecting.

### LiveKit media (audio/video)

```
Browser ←→ server :7882/UDP  (RTP/RTCP (direct, no proxy))
Browser ←→ server :7881/TCP  (fallback when UDP blocked)
```

The ports above cover this Docker Compose example's fixed-port setup. For the full, exhaustive port/firewall reference across all LiveKit deployment modes (port ranges, TURN, SIP), see [LiveKit's own ports and firewall documentation](https://docs.livekit.io/home/self-hosting/ports-firewall/).

### LiveKit webhook (room, egress, and recording events)

```
LiveKit Server → POST https://meet.example.com/api/v1.0/rooms/webhooks-livekit/
```

This is also how the backend detects that a recording has finished uploading (`egress_ended` event).

## Docker networks

Meet uses two Docker networks:

| Network | Type | Members | Purpose |
|---|---|---|---|
| `proxy` | Bridge (external) | reverse proxy, frontend, livekit, keycloak | reverse proxy routing and TLS |
| `internal` | Bridge, one per stack | Meet stack: backend, frontend, celery, postgresql, redis, livekit, minio; Keycloak stack: keycloak, kc-postgresql | Service-to-service communication |

## Internal DNS resolution

Docker resolves container names within a network. Services reference each other by service name:

| From | To | Address |
|---|---|---|
| backend | postgresql | `postgresql:5432` |
| backend | redis | `redis:6379` |
| backend | livekit (API) | `https://livekit.example.com` |
| frontend nginx | backend | `backend:8000` |
| frontend nginx | frontend SPA | `frontend:8080` |
| livekit | redis | `redis:6379` |

## LiveKit media ports

LiveKit media (audio and video) goes directly between browsers and the LiveKit server, bypassing the reverse proxy. The ports required depend on your LiveKit configuration.

!!!info 
    Per LiveKit's client protocol, each participant uses up to two WebRTC PeerConnections - one for publishing, one for subscribing - not separated by port; each multiplexes its tracks via SSRC identifiers. The subscriber connection opens as soon as the participant joins; the publisher connection only opens once they actually publish a track (e.g. unmute camera/mic). Port 7881 is a TCP fallback used only when a participant's network blocks UDP.

LiveKit uses one UDP port, 7882, or a range; [LiveKit Configuration](../self-hosting/configuration/livekit.md#udp-port-strategy) explains which to choose.

### Media path: direct

```
Participant A browser
  │ WebSocket (TCP 443) → reverse proxy → livekit:7880
  │ RTP/RTCP  (UDP 7882) ────────────────► livekit:7882  (direct, no proxy)
  │
  ▼
LiveKit server (SFU - forwards, does not transcode)
  │ RTP/RTCP  (UDP 7882) ────────────────► Participant B browser
```

### Media path: TURN relay

When [TURN](../self-hosting/configuration/turn.md) is enabled, participants on restrictive networks relay through 443/UDP:

```
Participant A browser
  │ WebSocket  (TCP 443) → reverse proxy → livekit:7880
  │ TURN media (UDP 443) ─────────────────► livekit:443  (relay)
  │
  ▼
LiveKit TURN relay
  │ TURN media (UDP 443) ─────────────────► Participant B browser
```

## ICE and NAT traversal

How a participant's browser picks between direct UDP, TCP and a TURN relay is in [TURN Server](../self-hosting/configuration/turn.md#nat-traversal-and-ice-candidates). On a cloud server, set `use_external_ip: true` so LiveKit announces its public IP, see [LiveKit Configuration](../self-hosting/configuration/livekit.md#use_external_ip).
