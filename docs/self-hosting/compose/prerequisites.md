# Prerequisites (Docker Compose)

To install Meet with Docker Compose, you need a Linux server, Docker, three domain names and a sign-in provider. For a cluster, see the [Kubernetes prerequisites](../kubernetes/prerequisites.md).

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

Any Linux distribution that runs Docker Engine works. Open the ports listed in [Firewall & Ports](../configuration/firewall.md).

## Software requirements

### Docker

Meet runs in containers, so the server needs Docker Engine, not Docker Desktop. Install it and let your user run `docker` without `sudo`:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

The install steps also use `curl` and `openssl`.

### Docker Compose

Each part of Meet starts with `docker compose`. Docker Engine includes Compose v2; check that the version starts with `v2`:

```bash
docker compose version
# Docker Compose version v2.x.x
```

### Domain name

Meet requires HTTPS: a self-signed certificate does not work for WebRTC, which carries the audio and video. Point three subdomains at your server's public IP. The reverse proxy, the server in front of Meet that handles HTTPS, gets a certificate for each:

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet frontend and backend API |
| `auth.example.com` | Keycloak, if you run the Deployment Guide's Keycloak stack |
| `livekit.example.com` | LiveKit WebSocket, TLS-terminated by the reverse proxy |

Each must resolve before you start the stacks: Let's Encrypt checks it when it issues the certificate.

## OIDC provider

Users sign in through an OIDC provider, a login service that tells Meet who they are. Any works, see [SSO & Authentication](../configuration/sso.md); without one, the install runs Keycloak.

## Checklist

- [ ] A Linux server with the hardware specs above
- [ ] Docker and Docker Compose installed
- [ ] The ports in [Firewall & Ports](../configuration/firewall.md) open
- [ ] Three subdomains pointing to your server (meet, auth, livekit)
- [ ] An OIDC provider with a client for Meet, or the plan to run Keycloak

## Next: pick your guide

- [Quick Start](quick-start.md): one script on a fresh server, with nginx-proxy and Keycloak.
- [Deployment Guide](deployment-guide.md): the same steps by hand, when you already run a reverse proxy or sign-in provider, use Traefik, or want to control each step.
