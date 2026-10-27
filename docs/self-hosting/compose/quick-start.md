# Quick Start

One script installs Meet on a fresh Linux server, with HTTPS and sign-in ready. It runs the same three stacks the [Deployment Guide](deployment-guide.md) builds by hand, from the same example files, each in its own directory:

```
~/docker/
  nginx-proxy/   ← nginx-proxy + acme-companion (automatic TLS via Let's Encrypt)
  keycloak/      ← Keycloak with a pre-configured Meet realm
  meet/          ← Meet core: backend, frontend, celery, livekit, postgresql, redis
```

The script always installs nginx-proxy and Keycloak, and leaves out recording and transcription. Already run a reverse proxy or an identity provider, or want Traefik? Use the [Deployment Guide](deployment-guide.md) instead: it lets you skip each stack you have.

**Before you run it:**

- A Linux server with Docker and docker compose installed - see [Prerequisites](prerequisites.md)
- The ports in [Firewall & Ports](../configuration/firewall.md) open
- The three DNS records in [Domain name](prerequisites.md#domain-name), resolving before you run the script

---

## Download and run

Download the script so you can read it first:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL $RAW/docs/install.sh -o install.sh
```

Review it, then run:

```bash
bash install.sh
```

The script asks for your three domains and two email addresses, generates all secrets, starts the three stacks, and runs the database migrations. It ends with `Setup complete!`.

It only sets up a fresh install: it stops if `~/docker/keycloak` or `~/docker/meet` exists, since new passwords would not match the existing databases. To start over, run `docker compose down -v` in each, which deletes their data, then delete both directories.

---

## After setup

The script ends by printing three logins. Note the two printed passwords: they are saved nowhere else. The URLs use the domains you typed when the script asked, with no port.

| Login | What for | URL | User | Password |
|---|---|---|---|---|
| Meet | Sign in to Meet and start meetings | `https://meet.example.com` | `meet-admin` | Printed, single-use: Keycloak asks for a new one |
| Django admin | Manage rooms, users and recordings | `https://meet.example.com/admin/` | The admin email you entered | Printed |
| Keycloak console | Add or manage the people who can sign in | `https://auth.example.com/admin/` | `admin` | `KC_BOOTSTRAP_ADMIN_PASSWORD` in `~/docker/keycloak/env.d/keycloak` |

## Next

To understand or change a piece the script set up, read the [Deployment Guide](deployment-guide.md): same stacks, same files. Before production, work through its [After installation](deployment-guide.md#after-installation) steps too:

- [Configure SMTP](../configuration/email.md) - required for recording and invitation emails
- [Configure TURN](../configuration/livekit.md#turn) - a relay for participants on restricted corporate networks
- [Configure recording](../configuration/recording.md) - LiveKit Egress + Garage
- [Configure AI transcription](../configuration/transcription.md) - WhisperX + summary service
- [Configure theming](../configuration/theming.md) - custom CSS, logo, and branding
