# Quick Start

The install script sets up three stacks, each in its own directory and managed independently:

```
~/docker/
  nginx-proxy/   ← nginx-proxy + acme-companion (automatic TLS via Let's Encrypt)
  keycloak/      ← Keycloak with a pre-configured Meet realm
  meet/          ← Meet core: backend, frontend, celery, livekit, postgresql, redis
```

Already run a reverse proxy or an identity provider? Use the [Deployment Guide](deployment-guide.md) instead: it lets you skip each stack you have.

**Prerequisites:**

- A Linux server with Docker and docker compose installed - see [Prerequisites](prerequisites.md)
- The ports in [Firewall & Ports](../configuration/firewall.md) open
- The three DNS records in [Domain name](prerequisites.md#domain-name), resolving before you run the script

---

## Download and run

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL $RAW/docs/install.sh -o install.sh
```

Review it, then run:

```bash
bash install.sh
```

The script prompts for your three domains and two email addresses, generates all secrets, and starts everything.

It only sets up a fresh install: it stops if `~/docker/keycloak` or `~/docker/meet` exists, since new passwords would not match the existing databases. To start over, run `docker compose down -v` in each, which deletes their data, then delete both directories.

---

## After setup

The script ends by printing three logins. Note the two printed passwords: they are saved nowhere else.

| Login | URL | User | Password |
|---|---|---|---|
| Meet | `https://meet.example.com` | `meet-admin` | Printed, single-use: Keycloak asks for a new one |
| Django admin | `https://meet.example.com/admin/` | The admin email you entered | Printed |
| Keycloak console | `https://auth.example.com` | `admin` | `KC_BOOTSTRAP_ADMIN_PASSWORD` in `~/docker/keycloak/env.d/keycloak` |

**Recommended next steps:**

- [Configure recording](../configuration/recording.md) - LiveKit Egress + Garage
- [Configure AI transcription](../configuration/transcription.md) - WhisperX + summary service
- [Configure TURN](../configuration/livekit.md#turn) - for participants on restricted corporate networks
- [Configure SMTP](../configuration/email.md) - required for recording and invitation emails
- [Configure theming](../configuration/theming.md) - custom CSS, logo, and branding
