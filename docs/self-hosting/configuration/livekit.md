# LiveKit Configuration

LiveKit is the WebRTC media server powering all real-time audio, video, and screen sharing in Meet. The base configuration is created in the [Deployment Guide](../compose/deployment-guide.md). This page covers the LiveKit configuration options that matter most for self-hosting: UDP port strategy, TURN, and production tips.

!!! info 
    **TLS:** LiveKit's WebSocket must be served over WSS. Your reverse proxy handles this by terminating TLS on a dedicated subdomain (`livekit.example.com`) and forwarding to port 7880 inside Docker.

---

## How LiveKit uses ports

LiveKit uses two separate channels:

- **Signaling** (WebSocket): handled by your reverse proxy on port 443, forwarded to LiveKit on port 7880. No extra firewall rule needed.
- **Media** (WebRTC RTP/RTCP): goes directly between browsers and LiveKit, bypassing the reverse proxy. This requires at least one UDP port open on your firewall.

!!!info 
    All audio and video tracks - including screen shares - are multiplexed on a **single UDP connection** using SSRC identifiers. Port 7881 is a TCP fallback for the same traffic when a participant's network blocks UDP.

---

## UDP port strategy

You have two options for the media UDP port. Choose one when writing your `livekit-server.yaml`.

### Option A: Single fixed port (recommended for Docker Compose)

LiveKit listens on one specific UDP port. Simple firewall rule, easiest to reason about.

```yaml
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
```

Open on your firewall: `7881/TCP` and `7882/UDP`.

**Use this when:** you are running a single LiveKit instance on a single server (the standard Docker Compose setup). `7882` is the conventional port but any available port works.

### Option B: Port range

LiveKit allocates a UDP port from a configured range for each ICE session. This is the LiveKit default when no `udp_port` is set.

```yaml
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
```

Open on your firewall: `7881/TCP` and `50000–60000/UDP`.

**Use this when:**

- Running LiveKit on Kubernetes with a NodePort or LoadBalancer service that exposes a port range
- Running multiple LiveKit processes on one host (each needs its own port space)
- Your cloud environment or network equipment works better with ephemeral ports

**Tradeoff:** Opening a large UDP range (`50000–60000`) is a wider firewall surface than a single port. For single-server Docker Compose deployments, Option A is simpler and equivalent in practice - LiveKit allocates one port per ICE session regardless; the only question is whether that port is fixed or from a range.

!!!warning 
     **Do not set both `udp_port` and `port_range_start/end` at the same time.** If `udp_port` is set, it takes precedence and the range is ignored.

---

## `use_external_ip`

Always set this on cloud servers:

```yaml
rtc:
  use_external_ip: true
```

Cloud VPS instances are behind NAT: the server's network interface has a private IP, but participants need to reach the public IP. With `use_external_ip: true`, LiveKit queries a STUN server at startup to discover its public IP and announces that address in ICE candidates. Without it, LiveKit announces the private IP and participants cannot connect to the media port.

!!!Exception
    do not set this if your server has a public IP directly on the interface (bare-metal, some dedicated servers). In that case, LiveKit detects the correct IP automatically.

---

## Full `livekit-server.yaml` reference

A complete configuration for Docker Compose (Option A, no TURN):

```yaml
port: 7880

rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true

keys:
  meet: your-livekit-api-secret-here

redis:
  address: redis:6379

logging:
  level: info
```

With TURN enabled (Option A + built-in TURN):

```yaml
port: 7880

rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true

turn:
  enabled: true
  udp_port: 443
  domain: livekit.example.com

keys:
  meet: your-livekit-api-secret-here

redis:
  address: redis:6379

logging:
  level: info
```

---

## TURN

TURN (Traversal Using Relays around NAT) relays media through a port that corporate firewalls and hotel networks always allow. See the dedicated [TURN guide](turn.md) for full setup instructions, including built-in TURN, TURN over TLS, and external TURN servers.

**Quick summary of when you need TURN:** if any participants connect from corporate networks or VPNs, enable TURN. Without it, those participants may connect but have no audio or video.

---

## Docker Compose service reference

The LiveKit service in your `compose.yml`. Verify it matches if you're troubleshooting.

=== "nginx-proxy"

    ```yaml
    livekit:
      image: livekit/livekit-server:latest
      restart: unless-stopped
      command: --config /config.yaml
      environment:
        - VIRTUAL_HOST=livekit.example.com
        - VIRTUAL_PORT=7880
        - LETSENCRYPT_HOST=livekit.example.com
        - LETSENCRYPT_EMAIL=you@example.com
      ports:
        - "443:443/udp"     # only if TURN is enabled
        - "7881:7881/tcp"
        - "7882:7882/udp"
      volumes:
        - ./livekit-server.yaml:/config.yaml:ro
      depends_on:
        - redis
      networks:
        - proxy
        - internal
    ```

=== "Traefik"

    ```yaml
    livekit:
      image: livekit/livekit-server:latest
      restart: unless-stopped
      command: --config /config.yaml
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.meet-livekit.rule=Host(`livekit.example.com`)"
        - "traefik.http.routers.meet-livekit.entrypoints=websecure"
        - "traefik.http.routers.meet-livekit.tls=true"
        - "traefik.http.routers.meet-livekit.tls.certresolver=letsencrypt"
        - "traefik.http.services.meet-livekit.loadbalancer.server.port=7880"
      ports:
        - "443:443/udp"     # only if TURN is enabled
        - "7881:7881/tcp"
        - "7882:7882/udp"
      volumes:
        - ./livekit-server.yaml:/config.yaml:ro
      depends_on:
        - redis
      networks:
        - proxy
        - internal
    ```

Port 7880 is **not** exposed on the host - it is proxied by your reverse proxy. The `443:443/udp` mapping is only needed when TURN is enabled.

If you use the port range option instead of `udp_port: 7882`, replace the single `7882:7882/udp` mapping with the range:

```yaml
ports:
  - "7881:7881/tcp"
  - "50000-60000:50000-60000/udp"
```

---

## Backend environment variables

The LiveKit-related variables in your `.env`:

```dotenv
LIVEKIT_API_KEY=meet
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_API_URL=https://livekit.example.com
```

`LIVEKIT_API_URL` serves two purposes: it is used for server-side API calls (start/stop recording, participant management) and is returned to browsers as the WebSocket address. It must be the **public HTTPS URL** - not the Docker-internal address (`http://livekit:7880`). The backend resolves public hostnames via the `proxy` Docker network; ensure the backend service is in both the `proxy` and `internal` networks.

---

## Firewall

See [Firewall & Ports](firewall.md) for the complete port table, cloud security group rules, and ufw commands for each configuration.

---

## Verifying the setup

```bash
# Check LiveKit is reachable via HTTPS (after cert is issued)
curl -s -o /dev/null -w "%{http_code}" https://livekit.example.com/
# Expected: 200

# Check LiveKit logs for startup errors
docker compose logs livekit --tail=30

# Verify the WebSocket endpoint responds
curl -s -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" \
  https://livekit.example.com/
# Expected: 101 or 400 (both confirm LiveKit is reachable; 502 means the proxy can't reach it)
```

If these pass, join a meeting and confirm audio and video flow. If participants connect but have no media, the issue is almost always the media UDP port being blocked. See [Troubleshooting](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).

---

## LiveKit Egress (for recording)

LiveKit Egress is a separate service required for recording. See [Recording](recording.md).

---

## Production tips

- Run LiveKit on a server with **sufficient bandwidth**: it forwards all participant media streams
- Monitor LiveKit CPU and memory; each participant track consumes resources.
- Keep the LiveKit API secret 32+ characters and treat it like a database password
- Pin the LiveKit image version in production - check the [LiveKit releases](https://github.com/livekit/livekit/releases) for compatibility with your Meet version
