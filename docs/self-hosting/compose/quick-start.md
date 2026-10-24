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

Download the script:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL $RAW/docs/install.sh -o install.sh
```

Review it, then run:

```bash
bash install.sh
```

The script prompts for your three domains and two email addresses, generates all secrets, and starts everything.

It only sets up a fresh install. It stops if `~/docker/keycloak` or `~/docker/meet` already exists, since new passwords would not match the existing databases. To start over, run `docker compose down -v` in each of those directories, which also deletes their data, then delete them.

---

## After setup

The end of the script's output lists three logins. The two passwords it prints are saved nowhere else, so note them down.

- Open `https://meet.example.com` and log in with `meet-admin` and the password printed for it. It's a
  single-use password - Keycloak will ask you to set a new one immediately.
- The Django admin panel is at `https://meet.example.com/admin/`: log in with the admin email you entered and the password printed for it.
- The Keycloak admin console is at `https://auth.example.com`: log in with `admin` and the `KC_BOOTSTRAP_ADMIN_PASSWORD` value in `~/docker/keycloak/env.d/keycloak`.

**Recommended next steps:**

- [Configure recording](../configuration/recording.md) - LiveKit Egress + Garage
- [Configure AI transcription](../configuration/transcription.md) - WhisperX + summary service
- [Configure TURN](../configuration/livekit.md#turn) - for participants on restricted corporate networks
- [Configure SMTP](../configuration/email.md) - required for recording download and room email invitation notifications
- [Configure theming](../configuration/theming.md) - custom CSS, logo, and branding
