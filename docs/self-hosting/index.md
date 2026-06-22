# Self-Hosting LaSuite Meet

LaSuite Meet is fully self-hostable under the MIT license.

## Deployment options

### Quick Start

One script sets up everything - nginx-proxy, Keycloak, and Meet core - in under 10 minutes. Best for evaluating Meet or deploying from scratch.

→ [Quick Start](compose/quick-start.md)

### Docker Compose

Step-by-step deployment, one stack at a time. Skip stacks you already have (reverse proxy, identity provider, object storage).

→ [Deployment Guide](compose/deployment-guide.md)

### Kubernetes / Helm

The method used by DINUM in production for Visio. For large organisations, high-availability requirements, and teams comfortable with Kubernetes.

→ [Kubernetes guide](kubernetes/prerequisites.md)

### Other methods

| Method | Status | Notes |
|---|---|---|
| Scalingo PaaS | Official | See [Scalingo guide](scalingo.md) |
| Nix | Community | Unstable |
| YunoHost | Community | Small instances only, under construction |

---

## What you need to run

**Core** (video, audio, screen sharing, chat, lobby):

| Component | Purpose |
|---|---|
| Meet backend (Django) | REST API, auth, room management |
| Meet frontend (React) | Browser-based UI |
| LiveKit server | WebRTC media server |
| PostgreSQL | Persistent data |
| Redis | Cache and Celery broker |
| OIDC provider | User authentication |

**For recording and transcription:**

| Component | Purpose |
|---|---|
| LiveKit Egress | Room recording |
| MinIO / S3 storage | Recording file storage |
| Summary service | AI transcription & summary |
| Celery workers | Async task processing |

---

## Configuration

After deploying the core, use the Configuration section to enable and tune features:

- [LiveKit](configuration/livekit.md) - UDP port strategy, `use_external_ip`, production tips
- [Firewall & Ports](configuration/firewall.md) - port tables, cloud security groups, ufw/firewalld rules
- [TURN Server](configuration/turn.md) - relay for participants on restrictive networks
- [SSO & Authentication](configuration/sso.md) - Keycloak, Authentik, Google, Microsoft, and others
- [Recording](configuration/recording.md) - LiveKit Egress + MinIO
- [AI Transcription](configuration/transcription.md) - WhisperX + summary service
- [Telephony](configuration/telephony.md) - SIP dial-in via LiveKit SIP bridge
- [Theming](configuration/theming.md) - custom CSS, logo, build-time options
- [Upgrading](configuration/upgrade.md)

---

## Docker images

- `lasuite/meet-backend` - Django backend
- `lasuite/meet-frontend` - nginx router + React SPA
- `livekit/livekit-server` - LiveKit server
- `livekit/egress` - LiveKit Egress

All images are on [Docker Hub](https://hub.docker.com/u/lasuite).

## Getting help

- **Matrix**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- **GitHub Issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
- **GitHub Discussions**: [github.com/suitenumerique/meet/discussions](https://github.com/suitenumerique/meet/discussions)
