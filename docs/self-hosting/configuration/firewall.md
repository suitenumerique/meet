# Firewall & Ports

Set up the firewall of your Meet server, opening the ports it needs and keeping its internal services closed. Open each port to any address, `0.0.0.0/0`, in your cloud provider's security group, or in [the host firewall](#the-host-firewall).

## Ports to open

| Port | Protocol | Needed when | Carries |
|---|---|---|---|
| 80 | TCP | Always | Let's Encrypt challenges, and the redirect to HTTPS |
| 443 | TCP | Always | HTTPS for Meet, its API, LiveKit's signalling WebSocket and Keycloak |
| 7881 | TCP | Always | Media, for participants whose network blocks UDP |
| 7882 | UDP | Always, with the default media port | All audio and video |
| 50000–60000 | UDP | Instead of 7882, with a [port range](livekit.md#the-media-port) | All audio and video |
| 443 | UDP | With [TURN over UDP](livekit.md#turn-over-udp-on-443) | Relayed media |
| 5349 | TCP | With [TURN over TLS](livekit.md#turn-over-tls) | Relayed media, inside TLS |
| 5060 | UDP | With [telephony](telephony.md) | SIP signalling from your phone provider |
| 10000–20000 | UDP | With telephony | Phone call audio |

LiveKit's own list: [ports and firewall](https://docs.livekit.io/home/self-hosting/ports-firewall/).

## Never public

| Port | Service |
|---|---|
| 7880 | LiveKit's signalling, behind the reverse proxy |
| 8083 | The frontend's nginx, behind the reverse proxy |
| 8080 | Keycloak, behind the reverse proxy |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9000 | Garage's S3 API, when you run it for recording, and Keycloak's health checks |

The Docker Compose files publish none of these.

## The host firewall

ufw and firewalld do not filter a port Docker publishes, which with Docker Compose is every port above: filter those in your cloud provider's security group, and never publish a port that must stay closed.

Open the [ports](#ports-to-open) Docker does not publish, such as LiveKit's on Kubernetes, in the host firewall.

## Check the ports

```bash
# From another machine: each connects when its TCP port is open
nc -zv meet.example.com 443
nc -zv meet.example.com 7881
```

`nc -zuv` cannot prove a UDP port is open. To test 7882/UDP, hold a call between two devices on different networks. On the server, `docker compose ps livekit` lists the published ports.

## Traffic flow

Each kind of traffic takes its own path between the browser, the reverse proxy and Meet's containers.

### Web request

```
Browser :443
  → reverse proxy (TLS termination)
  → frontend container :8083 (routing nginx)
    → backend paths   → backend :8000 (Django)
    → everything else → frontend :8080 (React SPA)
```

The routing nginx, [`nginx-routing.conf`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/nginx-routing.conf), sends the paths of [What the proxy must route](../compose/reverse-proxy.md#what-the-proxy-must-route) to the backend. A custom nginx config needs its own location block for `/external-api`: the `/api` rule does not cover it.

### OIDC login

The backend sends the redirects that [Signing in](../../overview/how-meet-works.md#signing-in) shows, and exchanges the code with the provider at its public address, such as `auth.example.com:443`.

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

- When a participant's network blocks that UDP port, the browser falls back as [How media connects](livekit.md#how-media-connects) lists.
- On a cloud server whose public IP is not on its network interface, LiveKit needs [`use_external_ip`](livekit.md#use_external_ip) to announce that IP.

### LiveKit webhook

LiveKit posts each room and recording event to the backend, at the URL that [Webhook](livekit.md#webhook) sets.

## Docker networks

| Network | Type | Members | Purpose |
|---|---|---|---|
| `proxy` | External bridge | reverse proxy, frontend, livekit, keycloak | reverse proxy routing and TLS |
| `internal` | Bridge, one per stack | Meet stack: backend, frontend, celery, postgresql, redis, livekit; Keycloak stack: keycloak, postgresql | Service-to-service communication |

Object storage runs outside the Meet stack: the [Garage example](https://github.com/suitenumerique/meet/blob/main/docs/examples/garage/compose.yml) joins the Meet stack's `internal` network, as [Step 1: Object storage](recording.md#step-1-object-storage) sets up.

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
