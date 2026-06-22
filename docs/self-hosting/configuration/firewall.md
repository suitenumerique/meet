# Firewall & Ports

This page lists every port Meet needs and gives ready-to-use firewall rules for each configuration.

---

## Which ports does Meet need?

Meet has two categories of traffic:

**Web traffic** - handled entirely by your reverse proxy. These ports are always required regardless of LiveKit configuration:

| Port | Protocol | Purpose |
|---|---|---|
| 80 | TCP | HTTP: Let's Encrypt ACME challenge + redirect to HTTPS |
| 443 | TCP | HTTPS: Meet frontend, backend API, LiveKit WebSocket, Keycloak |

**LiveKit media** - WebRTC audio and video go directly between participants and the LiveKit server, bypassing the reverse proxy. The ports you need depend on your [LiveKit UDP strategy](livekit.md#udp-port-strategy) and whether you use [TURN](turn.md).

---

## Configuration A: Single UDP port (default)

The standard Docker Compose setup. Open three ports total beyond 80/443:

| Port | Protocol | Purpose |
|---|---|---|
| 7881 | TCP | WebRTC media TCP fallback (used when a participant's network blocks UDP) |
| 7882 | UDP | WebRTC media - all audio and video streams multiplexed here |

!!!info
    `7882/UDP` is the critical port. If it is blocked, participants connect to the room but have no audio or video and fall back to TCP (7881), which increases latency.

---

## Configuration B: UDP port range

If you use `port_range_start`/`port_range_end` in `livekit-server.yaml` instead of a fixed `udp_port`:

| Port | Protocol | Purpose |
|---|---|---|
| 7881 | TCP | WebRTC media TCP fallback |
| 50000–60000 | UDP | WebRTC media - LiveKit picks a port per ICE session from this range |

Replace `50000–60000` with whatever range you configured.

---

## Configuration C: TURN on 443/UDP

When [TURN](turn.md) is enabled, media is relayed through port 443/UDP. This replaces the direct media ports for participants who would otherwise be blocked:

| Port | Protocol | Purpose |
|---|---|---|
| 443 | UDP | TURN relay - all media for TURN clients routed here |
| 7881 | TCP | WebRTC media TCP fallback (still needed for direct connections) |
| 7882 | UDP | WebRTC media for direct connections (still used when available) |

!!!info
    Port 443/TCP and 443/UDP are independent sockets on Linux. Your reverse proxy holds 443/TCP; LiveKit holds 443/UDP. They do not conflict.

---

## Configuration D: TURN over TLS on 5349

If you additionally enable [TURN over TLS](turn.md#option-2-turn-over-tls) for participants who block all UDP:

| Port | Protocol | Purpose |
|---|---|---|
| 5349 | TCP | TURN/TLS - media tunnelled over HTTPS for UDP-blocked clients |

Add this on top of Configuration C.

---

## Ports that must NOT be exposed publicly

| Port | Service | Reason |
|---|---|---|
| 7880 | LiveKit | WebSocket entry point - proxied via your reverse proxy on 443 |
| 5432 | PostgreSQL | Database - internal only |
| 6379 | Redis | Cache/broker - internal only |
| 8000 | Django backend | API - proxied via frontend nginx |
| 8083 | Frontend nginx | Proxied via your reverse proxy |
| 9000/9001 | MinIO | Object storage - internal only |

---

## Firewall rules

### Cloud provider security groups (AWS, Hetzner, OVH, etc.)

The exact UI varies by provider, but the rule pattern is the same. For **Configuration A** (single UDP port, no TURN):

| Direction | Protocol | Port | Source |
|---|---|---|---|
| Inbound | TCP | 80 | 0.0.0.0/0 |
| Inbound | TCP | 443 | 0.0.0.0/0 |
| Inbound | TCP | 7881 | 0.0.0.0/0 |
| Inbound | UDP | 7882 | 0.0.0.0/0 |

For **Configuration C** (TURN on 443/UDP):

| Direction | Protocol | Port | Source |
|---|---|---|---|
| Inbound | TCP | 80 | 0.0.0.0/0 |
| Inbound | TCP | 443 | 0.0.0.0/0 |
| Inbound | UDP | 443 | 0.0.0.0/0 |
| Inbound | TCP | 7881 | 0.0.0.0/0 |
| Inbound | UDP | 7882 | 0.0.0.0/0 |

For **Configuration D** (TURN over TLS, add to C):

| Direction | Protocol | Port | Source |
|---|---|---|---|
| Inbound | TCP | 5349 | 0.0.0.0/0 |

---

### Linux - ufw

First check whether ufw is active:

```bash
sudo ufw status
```

If it is inactive, the OS firewall is not blocking anything and only your cloud provider's security group rules matter. If it is active, add rules to match your configuration.

**Configuration A** (single UDP port, no TURN):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw reload
```

**Configuration B** (port range):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw reload
```

**Configuration C** (add TURN):

```bash
sudo ufw allow 443/udp
sudo ufw reload
```

**Configuration D** (add TURN/TLS):

```bash
sudo ufw allow 5349/tcp
sudo ufw reload
```

---

### Linux - firewalld

For Fedora, RHEL, Rocky, AlmaLinux:

```bash
# Configuration A
sudo firewall-cmd --zone=public --permanent --add-port=80/tcp
sudo firewall-cmd --zone=public --permanent --add-port=443/tcp
sudo firewall-cmd --zone=public --permanent --add-port=7881/tcp
sudo firewall-cmd --zone=public --permanent --add-port=7882/udp
sudo firewall-cmd --reload

# Add for TURN (Configuration C)
sudo firewall-cmd --zone=public --permanent --add-port=443/udp
sudo firewall-cmd --reload

# Add for TURN/TLS (Configuration D)
sudo firewall-cmd --zone=public --permanent --add-port=5349/tcp
sudo firewall-cmd --reload
```

---

## Verifying ports are open

From another machine, test that the ports are reachable:

```bash
# Test TCP ports (nc exits immediately on success)
nc -zv your-server.example.com 443
nc -zv your-server.example.com 7881

# Test UDP reachability (sends one packet, listens briefly)
nc -zuv your-server.example.com 7882
```

From inside the server, confirm LiveKit is listening:

```bash
# Show all listening ports for the livekit process
ss -tulpn | grep livekit
```

Expected output for Configuration A:

```
udp   UNCONN  livekit  *:7882   *:*
tcp   LISTEN  livekit  *:7881   *:*
tcp   LISTEN  livekit  *:7880   *:*
```

---

## Telephony (SIP) - additional ports

If you enable [telephony](telephony.md), two additional port ranges must be open:

| Port | Protocol | Purpose |
|---|---|---|
| 5060 | UDP | SIP signaling |
| 10000–20000 | UDP | RTP media for SIP audio |

These are only needed if you run the `livekit-sip` service.
