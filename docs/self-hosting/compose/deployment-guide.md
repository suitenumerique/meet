# Deployment Guide

This guide sets up Meet across three separate Docker Compose stacks, each in its own directory. You can skip any stack you already have.

```
~/docker/
  nginx-proxy/   ← reverse proxy + TLS   (skip if you have one)
  keycloak/      ← identity provider     (skip if you have one)
  meet/          ← Meet core
```

Each stack is independent: you manage, upgrade, and restart them separately. They communicate through two Docker networks:

- `proxy` - external, shared between all stacks, used by the reverse proxy for routing
- `internal` - created per-stack, for service-to-service communication within each stack

The Meet backend (Stack 3) sits on `internal` only. It reaches `auth.example.com` and `livekit.example.com` for OIDC token exchange and LiveKit API calls through their public DNS records, like any other client. It never gets a `VIRTUAL_HOST` or proxy label itself - it's only reached via the frontend container's internal nginx.

**Prerequisites:** Complete the [Prerequisites](prerequisites.md) checklist first. DNS must resolve before you start - Let's Encrypt needs it.

---

## Before you start: configure your domains

All three stacks share the same domain names and Let's Encrypt email. Download the hosts file once and edit it - each stack will copy it in later.

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

mkdir -p ~/docker && cd ~/docker
curl -fsSL -o hosts ${RAW}/env.d/production.dist/hosts
```

Edit `~/docker/hosts`:

```dotenv
MEET_HOST=meet.example.com
IDP_HOST=auth.example.com
LIVEKIT_HOST=livekit.example.com
LETSENCRYPT_EMAIL=you@example.com
```

| Record | Purpose |
|---|---|
| `meet.example.com` | Meet frontend + API |
| `auth.example.com` | Keycloak |
| `livekit.example.com` | LiveKit WebSocket |

All three domains must have DNS A records pointing to your server before you proceed. Let's Encrypt verifies DNS during certificate issuance.

---

## Stack 1: Reverse proxy

Skip this section if you already have a reverse proxy running and attached to the `proxy` network.

Follow [Reverse Proxy](reverse-proxy.md), with nginx-proxy + acme-companion (recommended for new deployments) or Traefik. It covers the full setup, how Meet services integrate, and troubleshooting.

Once your proxy is running, continue to Stack 2.

---

## Stack 2: Identity provider

Meet logs users in through any OIDC provider. Whichever you use, register a confidential client for Meet with the redirect URI, the post-logout redirect URI and the web origin that [SSO: Client configuration](../configuration/sso.md#client-configuration) lists, then note the provider's endpoints and the client secret for Stack 3. [SSO & Authentication](../configuration/sso.md) gives the values for Authentik, Google and others.

If you already run a provider, skip to Stack 3.

### Quick start: Keycloak

This runs Keycloak on the same server, with a realm already holding Meet's client.

!!! warning
    Before production, harden this Keycloak per the [official Keycloak documentation](https://www.keycloak.org/documentation).

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL -o compose.yml           ${RAW}/docs/examples/keycloak/compose.yml
curl -fsSL -o keycloak-realm.json   ${RAW}/docs/examples/keycloak/keycloak-realm.json

curl -fsSL -o env.d/keycloak        ${RAW}/env.d/production.dist/keycloak
curl -fsSL -o env.d/kc_postgresql   ${RAW}/env.d/production.dist/kc_postgresql
cp ~/docker/hosts .env
```

Copy the proxy override for your reverse proxy:

=== "nginx-proxy"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/examples/keycloak/docker-compose.override.yml.nginx
    ```

=== "Traefik"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/examples/keycloak/docker-compose.override.yml.traefik
    ```

Generate secrets and write them into `env.d/`:

```bash
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_CLIENT_SECRET=$(openssl rand -hex 16)
# Only this one is typed into a browser by a human, so keep it short.
MEET_ADMIN_PASSWORD=$(openssl rand -base64 12)

sed -i "s|KC_BOOTSTRAP_ADMIN_PASSWORD=.*|KC_BOOTSTRAP_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}|" env.d/keycloak
sed -i "s|POSTGRES_PASSWORD=<generate postgres password>|POSTGRES_PASSWORD=${KC_DB_PASSWORD}|" env.d/kc_postgresql
```

`env.d/kc_postgresql` sets `KC_DB_PASSWORD=${POSTGRES_PASSWORD}` - Compose reads that from the value above, so `KC_DB_PASSWORD` needs no `sed` of its own.

!!!tip "Shortcut"
    [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) automates the `openssl`/`sed` pair above (and only that pair - it doesn't touch `keycloak-realm.json`):
    ```bash
    curl -fsSL -o generate-secrets.sh ${RAW}/docs/generate-secrets.sh
    chmod +x generate-secrets.sh
    ./generate-secrets.sh env.d/
    ```
    Still generate `KC_CLIENT_SECRET` and `MEET_ADMIN_PASSWORD` yourself either way - both go into `keycloak-realm.json` below, which the script doesn't handle.

!!! warning
    The realm ships with a placeholder password for the `meet-admin` user. Keycloak is on a public
    URL, so whoever reaches the login page first can claim the account with the placeholder: the
    "temporary" flag only forces a password change at *first* login. Always randomize it below.

Edit `keycloak-realm.json` - replace four placeholders. The first line loads `MEET_HOST` from `.env` into your shell, and `ADMIN_EMAIL` is the email of the `meet-admin` account:

```bash
set -a; . ./.env; set +a
ADMIN_EMAIL=you@example.com

sed -i "s|REPLACE_ME|${KC_CLIENT_SECRET}|"                        keycloak-realm.json
sed -i "s|meet\.example\.com|${MEET_HOST}|g"                      keycloak-realm.json
sed -i "s|admin@example\.com|${ADMIN_EMAIL}|"                     keycloak-realm.json
sed -i "s|MEET_ADMIN_PASSWORD_PLACEHOLDER|${MEET_ADMIN_PASSWORD}|" keycloak-realm.json
```

Note down `MEET_ADMIN_PASSWORD` and `KC_CLIENT_SECRET` now - neither is stored in any `env.d/` file, and you'll need `KC_CLIENT_SECRET` again in Stack 3.

Start:

```bash
docker compose up -d
```

Keycloak takes ~30 seconds to become ready. Check with:

```bash
docker compose ps   # keycloak should show 'healthy'
```

!!! info
    The admin console is at `https://${IDP_HOST}`. Log in with `admin` / `${KC_ADMIN_PASSWORD}`.
    The Meet user is `meet-admin` / `${MEET_ADMIN_PASSWORD}` (the value you generated above). Keycloak
    will prompt for a new password on first login.

---

## Stack 3: Meet core

```bash
mkdir -p ~/docker/meet/env.d && cd ~/docker/meet

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL -o compose.yml         ${RAW}/docs/examples/meet/compose.yml
curl -fsSL -o livekit-server.yaml ${RAW}/docs/examples/meet/livekit-server.yaml
curl -fsSL -o nginx-routing.conf  ${RAW}/docs/examples/meet/nginx-routing.conf

curl -fsSL -o env.d/common     ${RAW}/env.d/production.dist/common
curl -fsSL -o env.d/postgresql ${RAW}/env.d/production.dist/postgresql
cp ~/docker/hosts .env
```

Copy the proxy override:

=== "nginx-proxy"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/examples/meet/docker-compose.override.yml.nginx
    ```

=== "Traefik"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/examples/meet/docker-compose.override.yml.traefik
    ```

If using Keycloak from Stack 2, set the OIDC client secret in `env.d/common`, using the `KC_CLIENT_SECRET` value you noted down earlier:

```bash
sed -i "s|OIDC_RP_CLIENT_SECRET=.*|OIDC_RP_CLIENT_SECRET=<KC_CLIENT_SECRET-you-noted-down>|" env.d/common
```

If using an existing OIDC provider, set `OIDC_RP_CLIENT_SECRET` to that provider's client secret instead, along with the OIDC endpoints, in `env.d/common`. See [SSO & Authentication](../configuration/sso.md) for per-provider instructions. For documentation on every variable, see the [Environment Variables reference](../../reference/env-variables.md).

### Generate secrets

```bash
DJANGO_SECRET_KEY=$(openssl rand -hex 32)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

sed -i "s|DJANGO_SECRET_KEY=<generate a secret key>|DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}|" env.d/common
sed -i "s|LIVEKIT_API_SECRET=<generate a secret key>|LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}|" env.d/common
sed -i "s|DB_PASSWORD=<generate a secure password>|DB_PASSWORD=${DB_PASSWORD}|" env.d/postgresql
sed -i "s|<your livekit secret key>|${LIVEKIT_API_SECRET}|" livekit-server.yaml
```

`env.d/postgresql` sets `POSTGRES_PASSWORD=${DB_PASSWORD}` - Compose reads that from the value above, so `POSTGRES_PASSWORD` needs no `sed` of its own. `LIVEKIT_API_SECRET` is written to both `env.d/common` and `livekit-server.yaml`: the backend and LiveKit server authenticate each other with this same value.

!!!tip "Shortcut"
    [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) automates the block above, including the `livekit-server.yaml` patch:
    ```bash
    curl -fsSL -o generate-secrets.sh ${RAW}/docs/generate-secrets.sh
    chmod +x generate-secrets.sh
    ./generate-secrets.sh env.d/ livekit-server.yaml
    ```

### Start

```bash
docker compose up -d
```

The reverse proxy detects the new containers and requests TLS certificates automatically. This takes under a minute once DNS has propagated.

### Run database migrations

Wait for the backend to become healthy, then run migrations:

```bash
docker compose ps   # backend should show 'healthy'
docker compose exec backend python manage.py migrate
```

All migrations should complete with `OK`.

### Create an admin account

Accounts created by logging in through your identity provider cannot open the admin panel at `https://meet.example.com/admin/`. Create one that can:

```bash
docker compose exec backend python manage.py createsuperuser \
  --email you@example.com --password '<a strong password>'
```

### Verify

```bash
docker compose ps
```

All services should show `running`:

```
NAME                    SERVICE      STATUS
meet-backend-1          backend      running (healthy)
meet-frontend-1         frontend     running
meet-celery-1           celery       running
meet-livekit-1          livekit      running
meet-postgresql-1       postgresql   running (healthy)
meet-redis-1            redis        running
```

Open `https://meet.example.com`. You should be redirected to your identity provider and, after login, land on the Meet home page.

---

## After installation

Your instance is running. Work through these before using it in production.

**1. Test end-to-end**

Open `https://meet.example.com`, log in, create a meeting, and confirm audio and video work from a second browser tab or device. If media is missing, see [Troubleshooting](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).

**2. Configure email**

Required for recording download notifications. Follow the Docker Compose section of [Email (SMTP)](../configuration/email.md#docker-compose-setup).

**3. Configure TURN**

Participants on corporate networks or VPNs may have no audio/video without TURN. See [TURN Server](../configuration/turn.md).

**4. Review security**

- Replace any placeholder value still left in `env.d/` or `keycloak-realm.json`
- Decide who can join rooms without logging in, see [Unauthenticated access](../configuration/sso.md#unauthenticated-access)
- Keep the LiveKit API secret 32+ characters - treat it like a database password
- See [Security](../../reference/security.md)

**5. Pin image versions**

`compose.yml` resolves image tags from `MEET_VERSION` and `LIVEKIT_VERSION`, both defaulting to `latest` if unset (`image: lasuite/meet-backend:${MEET_VERSION:-latest}`). Pin them in `.env` instead of editing `compose.yml`:

```dotenv
MEET_VERSION=v1.31.0
LIVEKIT_VERSION=v1.13.6
```

```bash
docker compose up -d
```

Check the [changelog](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) for the latest stable version.

**6. Set up database backups**

```bash
docker compose exec postgresql pg_dump -U meet meet > meet_backup_$(date +%Y%m%d).sql
```

Store backups off-server and test restoration before relying on them.

**7. Add features**

- [Recording](../configuration/recording.md) - LiveKit Egress + MinIO
- [AI Transcription](../configuration/transcription.md)
- [Upgrading](../configuration/upgrade.md)


---

## Troubleshooting

Common problems and their fixes are in [Troubleshooting](../../reference/troubleshooting.md).
