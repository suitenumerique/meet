# Prerequisites (Docker Compose)

For a cluster, see the [Kubernetes prerequisites](../kubernetes/prerequisites.md).

## A Linux server

Any Linux that runs Docker Engine, with the [ports](../configuration/firewall.md) open. Start from these sizes, then watch the load:

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB+, more with recording |
| Network | 100 Mbps | 1 Gbps |

## Docker

[Install Docker Engine](https://docs.docker.com/engine/install/), not Docker Desktop, for example with its install script:

```bash
curl -fsSL https://get.docker.com | sh
# Run docker without sudo
sudo usermod -aG docker $USER
# Log out and back in, then check that Compose answers
docker compose version
```

## Three domain names

Point three subdomains at your server's public IP before you start: Let's Encrypt checks them to issue the HTTPS certificates, and a self-signed one does not work for WebRTC.

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet |
| `auth.example.com` | Keycloak, not needed with your own [OIDC provider](../configuration/sso.md) |
| `livekit.example.com` | LiveKit, the media server |

## Next

- [Quick Start](quick-start.md): one script on a fresh server, with nginx-proxy and Keycloak.
- [Deployment Guide](deployment-guide.md): the same steps by hand, when you already run a reverse proxy or a sign-in provider.
