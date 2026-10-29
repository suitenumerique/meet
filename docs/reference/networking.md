# Networking

Each kind of traffic takes its own path between the browser, the reverse proxy and Meet's containers. The ports to open, and those never to expose, are in [Firewall & Ports](../self-hosting/configuration/firewall.md).

## Traffic flow

### Web request

```
Browser :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → backend paths   → backend :8000 (Django)
    → everything else → frontend :8080 (React SPA)
```

The routing nginx, [`nginx-routing.conf`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/nginx-routing.conf), sends the paths of [What the proxy must route](../self-hosting/compose/reverse-proxy.md#what-the-proxy-must-route) to the backend. A custom nginx config needs its own location block for `/external-api`: the `/api` rule does not cover it.

### OIDC login

The backend sends the redirects that [Signing in](../overview/how-meet-works.md#signing-in) shows, and exchanges the code with the provider at its public address, such as `auth.example.com:443`.

### LiveKit signaling

```
Browser → https://livekit.example.com :443 /rtc
  → reverse proxy (TLS termination, WebSocket upgrade)
  → livekit container :7880 (plain WebSocket)
```

The LiveKit client appends `/rtc`, the signaling path, by itself.

### LiveKit media

Audio and video go straight between each browser and LiveKit, without the reverse proxy:

```
Participant A browser
  │ WebSocket (TCP 443) → reverse proxy → livekit:7880
  │ RTP/RTCP  (UDP 7882) ────────────────► livekit:7882  (direct, no proxy)
  │
  ▼
LiveKit server (SFU: forwards each stream, does not transcode)
  │ RTP/RTCP  (UDP 7882) ────────────────► Participant B browser
```

- When a participant's network blocks that UDP port, the browser falls back as [How media connects](../self-hosting/configuration/livekit.md#how-media-connects) lists. Every port is in [Firewall & Ports](../self-hosting/configuration/firewall.md).
- On a cloud server whose public IP is not on its network interface, LiveKit needs [`use_external_ip`](../self-hosting/configuration/livekit.md#use_external_ip) to announce that IP.

### LiveKit webhook

LiveKit posts each room and recording event to the backend, at the URL that [Webhook](../self-hosting/configuration/livekit.md#webhook) sets.

## Docker networks

| Network | Type | Members | Purpose |
|---|---|---|---|
| `proxy` | External bridge | reverse proxy, frontend, livekit, keycloak | reverse proxy routing and TLS |
| `internal` | Bridge, one per stack | Meet stack: backend, frontend, celery, postgresql, redis, livekit; Keycloak stack: keycloak, postgresql | Service-to-service communication |

Object storage runs outside the Meet stack: the [Garage example](https://github.com/suitenumerique/meet/blob/main/docs/examples/garage/compose.yml) joins the Meet stack's `internal` network, as [Step 1: Object storage](../self-hosting/configuration/recording.md#step-1-object-storage) sets up.

## Service addresses

Services reach each other by service name, except the backend, which calls LiveKit and the identity provider at their public URLs.

| From | To | Address |
|---|---|---|
| backend | postgresql | `postgresql:5432` |
| backend | redis | `redis:6379` |
| backend | livekit (API) | `https://livekit.example.com` |
| backend | identity provider | `https://auth.example.com` |
| frontend nginx | backend | `backend:8000` |
| frontend nginx | frontend SPA | `frontend:8080` |
| livekit | redis | `redis:6379` |
