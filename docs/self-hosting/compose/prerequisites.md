# Prerequisites (Docker Compose)

For a cluster, see the [Kubernetes prerequisites](../kubernetes/prerequisites.md).

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

Docker Engine includes Compose v2; check that the version starts with `v2`:

```bash
docker compose version
# Docker Compose version v2.x.x
```

### Domain name

Meet requires HTTPS: a self-signed certificate does not work for WebRTC, which carries the audio and video. Point three subdomains at your server's public IP:

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet frontend and backend API |
| `auth.example.com` | Keycloak, unless you use your own OIDC provider |
| `livekit.example.com` | LiveKit, the media server |

Each must resolve before you start the stacks: Let's Encrypt checks it when it issues the certificate.

## OIDC provider

Users sign in through an OIDC provider, a login service that tells Meet who they are. Any works, see [SSO & Authentication](../configuration/sso.md); without one, the install runs Keycloak.

## Checklist

- [ ] A Linux server meeting the [Hardware](#hardware) table
- [ ] Docker and Docker Compose installed
- [ ] The ports in [Firewall & Ports](../configuration/firewall.md) open
- [ ] `meet`, `auth` and `livekit` subdomains pointing to your server
- [ ] An OIDC provider with a client for Meet, or the plan to run Keycloak

## Next: pick your guide

- [Quick Start](quick-start.md): one script on a fresh server, with nginx-proxy and Keycloak.
- [Deployment Guide](deployment-guide.md): the same steps by hand, when you already run a reverse proxy or a sign-in provider.
