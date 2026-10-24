# Prerequisites (Docker Compose)

## Server requirements

### Hardware

These numbers are a starting point, not a measured minimum: size the server to your number of concurrent meetings and watch its load.

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB+ (more if recording) |
| Network | 100 Mbps | 1 Gbps |

### Operating system and network

Any Linux distribution that runs Docker Engine. The ports to open are in [Firewall & Ports](../configuration/firewall.md).

## Software requirements

### Docker

Install Docker Engine, not Docker Desktop. The first line runs Docker's install script; the second lets your user run `docker` without `sudo`:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

### Docker Compose

Docker Compose v2 is included with Docker Engine. Check it prints a v2 version:

```bash
docker compose version
# Docker Compose version v2.x.x
```

### Domain name

Meet requires HTTPS: a self-signed certificate does not work for WebRTC. Point three subdomains at your server's public IP:

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet frontend and backend API |
| `auth.example.com` | Keycloak, if you run the Deployment Guide's Keycloak stack |
| `livekit.example.com` | LiveKit WebSocket, TLS-terminated by the reverse proxy |

Each must resolve before you start the stacks: Let's Encrypt checks it when it issues the certificate.

## OIDC provider

Meet works with any OIDC provider, see [SSO & Authentication](../configuration/sso.md). The [Deployment Guide](deployment-guide.md) can run Keycloak for you.

## Summary

Before proceeding to the [Deployment Guide](deployment-guide.md), ensure you have:

- [ ] A Linux server with the hardware specs above
- [ ] Docker and Docker Compose installed
- [ ] The ports in [Firewall & Ports](../configuration/firewall.md) open
- [ ] Three subdomains pointing to your server (meet, auth, livekit)
- [ ] An OIDC provider with a client for Meet, or the plan to run the Deployment Guide's Keycloak stack
