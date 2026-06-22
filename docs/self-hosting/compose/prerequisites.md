# Prerequisites (Simple Deployment)


## Server requirements

### Minimum hardware

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB+ (more if recording) |
| Network | 100 Mbps | 1 Gbps |

### Operating system

Any Linux distribution works. Tested with:

- A Linux server (Ubuntu 22.04 / 24.04 LTS or equivalent)
- Debian 12
- Fedora / RHEL-based (Rocky, AlmaLinux)

### Network requirements

The following ports must be open on your firewall. The exact set depends on your LiveKit configuration - see [Firewall & Ports](../configuration/firewall.md) for the full breakdown.

**Always required:**

| Port | Protocol | Purpose |
|---|---|---|
| 80 | TCP | HTTP (ACME challenge / redirect to HTTPS) |
| 443 | TCP | HTTPS (frontend, backend API, LiveKit WebSocket) |

**LiveKit media - choose one UDP strategy:**

| Port | Protocol | Purpose |
|---|---|---|
| 7881 | TCP | LiveKit TCP media fallback (always needed alongside UDP) |
| 7882 | UDP | LiveKit media - single fixed port (default) |
| *or* 50000–60000 | UDP | LiveKit media - port range (alternative, see [LiveKit config](../configuration/livekit.md#udp-port-strategy)) |

**Optional - add if using TURN:**

| Port | Protocol | Purpose |
|---|---|---|
| 443 | UDP | TURN relay for participants behind restrictive firewalls |
| 5349 | TCP | TURN/TLS for participants blocking all UDP |

!!! info

    Port 7880 (LiveKit WebSocket) is **not** exposed publicly, it is proxied by your reverse proxy on port 443.

    A UDP media port (7882 or a range) is critical for low-latency media. Without it, clients fall back to TCP (7881), which increases latency. If participants on enterprise networks have no audio/video, enable [TURN](../configuration/turn.md).

## Software requirements

### Docker

Install Docker Engine (not Docker Desktop):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

Verify:
```bash
docker --version
# Docker version 25.x.x or later
```

### Docker Compose

Docker Compose v2 is included with Docker Engine. Verify:

```bash
docker compose version
# Docker Compose version v2.x.x
```

### Domain name

You need a **domain name** with DNS pointing to your server. Meet requires HTTPS, a self-signed certificate will not work for WebRTC.

You need **three subdomains** pointing to your server:

- `meet.example.com`: Meet frontend and backend API
- `auth.example.com`: Keycloak OIDC provider
- `livekit.example.com`: LiveKit WebSocket (TLS-terminated by the reverse proxy)

All three must resolve to your server's public IP before you start the stack.

## OIDC provider

Meet requires an OIDC provider for user authentication. Options:

| Provider | Notes |
|---|---|
| **Keycloak** | Free, self-hostable, included in the dev stack |
| **Authentik** | Free, self-hostable, modern UI |
| **Dex** | Lightweight, self-hostable |
| **Auth0** | Cloud-hosted, free tier available |
| **Google Workspace** | If your org uses Google |
| **Microsoft Entra** | If your org uses Microsoft 365 |
| ... | ... |

## Summary

Before proceeding to the [Deployment Guide](deployment-guide.md), ensure you have:

- [ ] A Linux server with the hardware specs above
- [ ] Docker and Docker Compose installed
- [ ] Ports 80/TCP, 443/TCP, 7881/TCP, and 7882/UDP open (7880 is internal only) - see [Firewall & Ports](../configuration/firewall.md) for alternatives
- [ ] Three subdomains pointing to your server (meet, auth, livekit)
- [ ] An OIDC provider configured with client credentials
