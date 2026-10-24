# Self-Hosting LaSuite Meet

LaSuite Meet is fully self-hostable under the MIT license. The maintainers run only Kubernetes in production, so advanced support covers that setup alone.

## Deployment options

| Method | Status | Best for | Guide |
|---|---|---|---|
| Quick Start (Docker Compose) | Maintained | Evaluating Meet, or a fresh server: one script sets up nginx-proxy, Keycloak and Meet core | [Quick Start](compose/quick-start.md) |
| Docker Compose, step by step | Maintained | One stack at a time, skipping the reverse proxy or identity provider you already run | [Deployment Guide](compose/deployment-guide.md) |
| Kubernetes / Helm | Maintained, advanced support | Large organisations, high availability, teams comfortable with Kubernetes. DINUM runs Visio this way | [Kubernetes guide](kubernetes/prerequisites.md) |
| Scalingo PaaS | Official | | [Scalingo guide](scalingo.md) |
| Nix | Community | Unstable | [package](https://search.nixos.org/packages?channel=unstable&show=lasuite-meet&query=lasuite-meet) |
| YunoHost | Community | Small instances only, under construction | [package](https://github.com/YunoHost-Apps/meet_ynh) |

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
| Celery worker | Background tasks such as file deletion, when `CELERY_ENABLED` is `True`; otherwise the backend runs them itself |
| OIDC provider | User authentication |

**For recording and transcription:**

| Component | Purpose |
|---|---|
| LiveKit Egress | Room recording |
| S3-compatible object storage | Recording files and uploaded backgrounds |
| Summary service | AI transcription & summary |
| WhisperX API | Speech-to-text for transcription |
| Summary service Celery workers | Transcription and summary jobs |

**Optional features:**

| Component | Purpose |
|---|---|
| LiveKit SIP | Phone dial-in via SIP trunks |
| LiveKit Agents | Real-time subtitles, metadata collection |
| LaSuite Docs | Transcription document delivery |

---

## Configuration

Once the core runs, these pages enable and tune each feature:

- [LiveKit & TURN](configuration/livekit.md) - media port, `use_external_ip`, TURN relay for participants on restrictive networks
- [Firewall & Ports](configuration/firewall.md) - port tables, cloud security groups, ufw/firewalld rules
- [SSO & Authentication](configuration/sso.md) - Keycloak, Authentik, Google, Microsoft, and others
- [Recording](configuration/recording.md) - LiveKit Egress + Garage
- [AI Transcription](configuration/transcription.md) - WhisperX + summary service
- [Real-time Subtitles](configuration/subtitles.md) - LiveKit agents with Deepgram, Kyutai or Voxtral
- [Telephony](configuration/telephony.md) - SIP dial-in via LiveKit SIP bridge
- [Email (SMTP)](configuration/email.md) - recording notifications, room email invitations
- [Theming](configuration/theming.md) - custom CSS, logo, build-time options
- [Room purge](configuration/room-purge.md) - deleting inactive and deleted rooms
- [Audit logging](configuration/audit-logging.md) - who did what, as ECS JSON for a SIEM
- [Upgrading](configuration/upgrade.md)

---

## Docker images

- `lasuite/meet-backend` - Django backend
- `lasuite/meet-frontend` - nginx serving the React SPA
- `lasuite/meet-summary` - Transcription & summary service
- `lasuite/meet-agents` - LiveKit agents (metadata collector, subtitles)
- `livekit/livekit-server` - LiveKit server
- `livekit/egress` - LiveKit Egress
- `livekit/sip` - LiveKit SIP bridge (optional)

All are on Docker Hub, under [lasuite](https://hub.docker.com/u/lasuite) and [livekit](https://hub.docker.com/u/livekit).

## Getting help

See [Community and support](../index.md#community-and-support).
