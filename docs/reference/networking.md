# Networking

## Port reference

### Ports that must be open (public firewall)

| Port | Protocol | Service | Purpose |
|---|---|---|---|
| 80 | TCP | reverse proxy | HTTP: ACME challenge / redirect to HTTPS |
| 443 | TCP | reverse proxy | HTTPS: all web traffic (Meet, Keycloak, LiveKit WebSocket) |
| 7881 | TCP | LiveKit | TCP media fallback (when UDP is blocked) |
| 7882 | UDP | LiveKit | RTP/RTCP media: **critical for video/audio** |

### Ports that must NOT be exposed publicly

| Port | Service | Why |
|---|---|---|
| 5432 | PostgreSQL | Database: internal only |
| 6379 | Redis | Cache/broker: internal only |
| 7880 | LiveKit | WebSocket: proxied via nginx on 443 |
| 8000 | Django backend | API: proxied via frontend nginx on 443 |
| 8080 | Frontend SPA / Keycloak | Proxied via nginx on 443 |
| 8083 | Frontend routing nginx | Proxied via your reverse proxy on 443 |
| 3900/3901 | MinIO / Garage | Object storage: internal only (default MinIO: 9000) |

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

Only reachable when `EXTERNAL_API_ENABLED=True` on the backend - see [Application-Delegated](external-api-delegated.md) or [Resource Server](external-api-resource-server.md) for the authentication modes. This is a separate top-level path from `/api/*` and needs its own nginx location block, unlike add-ons above.

### OIDC login

```
Browser → meet.example.com/oidc/authenticate/
  → backend :8000 → redirect to auth.example.com :443
  → Keycloak login form
  → redirect to meet.example.com/api/v1.0/callback/
  → backend :8000 (code exchange with Keycloak via internal network)
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
| `internal` | Bridge (internal) | backend, frontend, celery, postgresql, redis, livekit, keycloak, kc-postgresql, minio | Service-to-service communication |

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

### UDP port options

There are two ways to configure the LiveKit media UDP port:

**Fixed port** (default Docker Compose setup):
```yaml
rtc:
  udp_port: 7882
```
Opens one UDP port. Simple and sufficient for single-server deployments.

**Port range** (for Kubernetes or multi-process setups):
```yaml
rtc:
  port_range_start: 50000
  port_range_end: 60000
```
LiveKit picks a port per ICE session from the range. Requires the full range open on the firewall.

See [LiveKit Configuration](../self-hosting/configuration/livekit.md#udp-port-strategy) for guidance on which to choose.

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

When [TURN](../self-hosting/configuration/turn.md) is enabled, restricted participants relay through 443/UDP:

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

LiveKit uses ICE (Interactive Connectivity Establishment) to find the best media path:

1. **Host candidates**: Server IP announced to clients
2. **STUN**: On cloud servers behind NAT, `use_external_ip: true` in `livekit-server.yaml` causes LiveKit to discover and announce its public IP via STUN at startup
3. **TURN**: For clients where direct UDP is blocked

Always set `use_external_ip: true` on cloud VPS instances - their network interface has a private IP, so LiveKit must discover the public one.

For a deeper, vendor-neutral explanation of *why* ICE/STUN/TURN work this way, see [WebRTC for the Curious](https://webrtcforthecurious.com/). For the exact TURN/STUN ports to open on a LiveKit deployment, see [LiveKit's ports and firewall documentation](https://docs.livekit.io/home/self-hosting/ports-firewall/).

## Firewall rules

See the dedicated [Firewall & Ports](../self-hosting/configuration/firewall.md) page for complete cloud security group rules, ufw, and firewalld commands for every configuration.
