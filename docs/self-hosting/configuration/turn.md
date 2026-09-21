# TURN Server

TURN (Traversal Using Relays around NAT) relays WebRTC media through a well-known server when direct peer-to-SFU connections fail due to restrictive NATs or firewalls. Without TURN, some participants can join the meeting (signaling works over WebSocket) but have no audio or video (media fails).

---

## Do you need TURN?

| Deployment | Recommendation |
|---|---|
| Internal team, controlled network | TURN optional - direct media typically works |
| Public instance, mixed networks | TURN recommended |
| Enterprise with corporate firewalls | TURN required - often UDP is blocked entirely |

**How to tell if TURN is needed:** participants connect (room appears joined, they see others) but have no audio or video. When they switch to a phone hotspot, media works - this indicates network restrictions. TURN solves it.

---

## NAT traversal and ICE candidates

WebRTC uses ICE (Interactive Connectivity Establishment) to negotiate the best connection path between client and server. LiveKit gathers multiple candidate types:

1. **Host candidates**: Direct connection to LiveKit's RTC ports (7881/TCP, 7882/UDP)
2. **STUN (srflx) candidates**: Reflexive candidates discovered via STUN - the client's public IP/port as seen by the STUN server
3. **TURN (relay) candidates**: Relayed connection through the TURN server

ICE tries candidates in order of preference:
- **Best**: Direct UDP to port 7882 (lowest latency)
- **Fallback**: ICE-TCP to port 7881 (when UDP blocked but TCP allowed)
- **Last resort**: TURN relay (when both direct UDP and TCP fail)

LiveKit uses Google's public STUN servers (`stun.l.google.com:19302`) by default if no custom STUN is configured.

### When TURN is required

**Symmetric NAT**: STUN alone cannot establish connectivity through symmetric NAT because the port mapping changes for each destination. TURN is required.

**UDP blocked**: Some corporate firewalls block all UDP traffic, including to port 7882. Clients fall back to:
- ICE-TCP (port 7881) if allowed, or
- TURN over TCP (port 443 or 5349) if configured

**TLS-only networks**: Highly restrictive networks with deep packet inspection may block all non-TLS traffic. In these cases, **TURN/TLS (port 5349 or 443)** is the only option.

---

## How LiveKit's built-in TURN works

LiveKit includes an embedded TURN server with integrated authentication. Only clients that have established a signal connection can allocate TURN resources - this prevents abuse.

When ICE negotiation determines TURN is needed:

1. Client connects to LiveKit via WebSocket (443/TCP or 7880/TCP)
2. LiveKit advertises TURN candidates in its ICE offer
3. Client establishes a TURN allocation on the configured port (UDP or TLS)
4. Media is relayed through that allocation

**TURN protocols supported by LiveKit's built-in server**:
- TURN over UDP
- TURN over TLS

**Note**: LiveKit's embedded TURN does **not** support TURN over plain TCP (port 3478). For environments requiring TURN/TCP, deploy an external TURN server like coturn (see [Option 3](#option-3-external-turn-server-coturn)).

---

## Option 1: TURN over UDP on port 443 (recommended)

The simplest setup. No extra server, no coturn. LiveKit serves TURN/UDP directly on port 443 - the same port used for HTTPS, but over UDP.

**Why port 443/UDP?** As QUIC (HTTP/3) gains adoption, many firewalls now allow UDP on port 443. This provides better performance than TCP (lower latency, better congestion control) while passing through most corporate firewalls.

**Port conflict note**: Port 443/UDP and 443/TCP are separate sockets on Linux and do not conflict. Your reverse proxy holds 443/TCP for HTTPS; LiveKit listens on 443/UDP for TURN.

### Step 1: Add the `turn:` block to `livekit-server.yaml`

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

- `udp_port: 443` - LiveKit listens for TURN UDP on port 443. Your reverse proxy holds 443/TCP; these are separate sockets on Linux and do not conflict.
- `domain: livekit.example.com` - LiveKit announces this domain in TURN candidates so clients know where to connect.

### Step 2: Expose 443/UDP in `compose.yml`

In the `livekit` service, add the UDP mapping:

```yaml
ports:
  - "443:443/udp"
  - "7881:7881/tcp"
  - "7882:7882/udp"
```

### Step 3: Open 443/UDP on your firewall

```bash
# ufw
sudo ufw allow 443/udp && sudo ufw reload

# firewalld
sudo firewall-cmd --zone=public --permanent --add-port=443/udp && sudo firewall-cmd --reload
```

For cloud provider security groups, add an inbound UDP rule for port 443 from `0.0.0.0/0`.

### Step 4: Restart LiveKit

```bash
docker compose restart livekit
```

### Verify TURN is working

Check that LiveKit logs show TURN is active:

```bash
docker compose logs livekit | grep -i turn
# Expected: something like "starting TURN server" or "TURN UDP listening on :443"
```

Then join a meeting from a restricted network (or simulate it by blocking port 7882 in a local firewall rule) and confirm audio/video works.

---

## Option 2: TURN over TLS (for UDP-blocked networks)

Some networks block **all UDP traffic**, including port 443/UDP. For those, TURN must be served over TLS. To firewalls, TURN/TLS traffic is indistinguishable from regular HTTPS, providing maximum connectivity.

**Port options**:
- **5349/TCP** - IANA standard TURN/TLS port (recommended)
- **443/TCP** - Alternative if running without an L4 load balancer (conflicts with HTTPS on the same IP)

LiveKit performs TLS termination for TURN/TLS. It needs direct access to certificate files - it **cannot** use certificates held by your reverse proxy (nginx, Traefik). Certificate renewal requires restarting LiveKit to pick up new files.

**When to use**: Enable this only if you have evidence of participants on UDP-blocking networks (testing shows media fails even with TURN/UDP on 443).

### Step 1: Get the certificate files

You need `fullchain.pem` and `privkey.pem` for `livekit.example.com` as files on disk. How to get them depends on your reverse proxy:

=== "nginx-proxy + acme-companion"

    acme-companion stores certificates in a Docker volume. Find the volume:

    ```bash
    docker volume inspect acme-companion_certs
    # Look for the Mountpoint path
    ```

    The files are at `<mountpoint>/livekit.example.com/fullchain.pem` and `.../privkey.pem`.

    Mount that directory read-only into the LiveKit container (see Step 2).

=== "Traefik"

    Traefik stores certificates in `acme.json`. Extract the certificate for `livekit.example.com`:

    ```bash
    # Install traefik-certs-dumper (https://github.com/ldez/traefik-certs-dumper)
    traefik-certs-dumper file --source ./acme.json --dest ./certs/
    ```

    Run this on a schedule (e.g., weekly cron) to keep the extracted files current after renewal.

    Alternatively, use Traefik's `tls.certificates` stanza to write certificates to disk directly.

### Step 2: Update `livekit-server.yaml`

```yaml
turn:
  enabled: true
  udp_port: 443
  tls_port: 5349
  domain: livekit.example.com
  cert_file: /certs/fullchain.pem
  key_file:  /certs/privkey.pem
```

!!!info 
    `cert_file` and `key_file` are paths **inside the LiveKit container**. Mount the host certificate directory as a volume (Step 3).

### Step 3: Update `compose.yml`

```yaml
livekit:
  ports:
    - "443:443/udp"
    - "5349:5349/tcp"
    - "7881:7881/tcp"
    - "7882:7882/udp"
  volumes:
    - ./livekit-server.yaml:/config.yaml:ro
    - /path/to/certs:/certs:ro   # mount host cert directory
```

Replace `/path/to/certs` with the directory containing `fullchain.pem` and `privkey.pem`.

### Step 4: Open port 5349

```bash
# ufw
sudo ufw allow 5349/tcp && sudo ufw reload

# firewalld
sudo firewall-cmd --zone=public --permanent --add-port=5349/tcp && sudo firewall-cmd --reload
```

Add an inbound TCP rule for 5349 in your cloud security group.

### Step 5: Restart LiveKit

```bash
docker compose restart livekit
```

### Certificate renewal

Let's Encrypt certificates renew every 90 days. After renewal, LiveKit must be restarted to pick up the new certificate files - it does not hot-reload them.

Add a cron job or systemd timer to restart LiveKit after certificate renewal:

```bash
# Example: weekly restart (safe; LiveKit restarts in seconds)
0 3 * * 0 docker compose -f /path/to/your/compose.yml restart livekit
```

---

## Option 3: External TURN server (coturn)

For environments requiring:
- **TURN over plain TCP** (port 3478) - not supported by LiveKit's built-in TURN
- **Separate TURN infrastructure** - to offload relay traffic from the LiveKit server
- **Multi-protocol support** - UDP, TCP, TLS all on one server

Deploy an external coturn server. Coturn supports all TURN transports:
- TURN/UDP (port 3478 or 443)
- TURN/TCP (port 3478)
- TURN/TLS (port 5349 or 443)

Configure LiveKit to advertise the external TURN server:

```yaml
rtc:
  turn_servers:
    - host: turn.example.com
      port: 443
      protocol: tls
      # Shared secret for coturn authentication
      secret: your-coturn-shared-secret
      ttl: 14400
```

LiveKit announces this server in ICE candidates instead of its built-in TURN. Coturn deployment and configuration is outside the scope of this guide. See [coturn documentation](https://github.com/coturn/coturn) for setup details.

---

## Troubleshooting TURN

**TURN is configured but participants on restricted networks still have no media**

1. Confirm 443/UDP is open: `nc -zuv your-server.example.com 443`
2. Check LiveKit is bound to 443/UDP: `ss -tulpn | grep 443`
3. Check LiveKit logs for TURN errors: `docker compose logs livekit | grep -i "turn\|error"`
4. Verify `domain` in `livekit-server.yaml` matches your actual LiveKit subdomain

**Port conflict on 443/UDP**

Only LiveKit should be bound to 443/UDP. If another process is already using it:

```bash
ss -ulpn | grep :443
```

**TURN/TLS: certificate errors on startup**

LiveKit logs `failed to load certificate` or similar. Check:
- The paths in `cert_file`/`key_file` are correct inside the container (not on the host)
- The volume mount in `compose.yml` is correct
- The certificate files are readable: `docker compose exec livekit ls -l /certs/`

**Participants still can't connect after TURN is enabled**

Some very restrictive networks (full TLS inspection proxies, "application-aware" firewalls) can still block TURN/UDP even on port 443. In those cases, [TURN over TLS (Option 2)](#option-2-turn-over-tls) is the only solution, as it wraps media inside a genuine TLS handshake on port 5349.
