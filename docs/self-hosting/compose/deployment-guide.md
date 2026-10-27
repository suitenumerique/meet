# Deployment Guide

This guide is the manual version of the [Quick Start](quick-start.md): the same three Docker Compose stacks, from the same files, built by hand. Follow it when you already run a reverse proxy or sign-in provider, use Traefik, or want to control each step. Each stack has its own directory:

```
~/docker/
  nginx-proxy/   ← reverse proxy + TLS   (skip if you have one)
  keycloak/      ← identity provider     (skip if you have one)
  meet/          ← Meet core
```

The stacks talk to each other through two Docker networks:

- `proxy` - external, shared between all stacks, used by the reverse proxy for routing
- `internal` - created per-stack, for service-to-service communication within each stack

The Meet backend (Stack 3) joins `internal` only and reaches the identity provider and LiveKit at their public addresses, see [Networking](../../reference/networking.md).

Complete the [Prerequisites](prerequisites.md) checklist first, [DNS records](prerequisites.md#domain-name) included.

---

## Before you start: configure your domains

Every stack needs your domains, so write them once in a `hosts` file; each stack copies it in as its `.env`, along with your Let's Encrypt email:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

mkdir -p ~/docker && cd ~/docker
curl -fsSL -o hosts ${RAW}/env.d/production.dist/hosts
```

Edit the four host and email lines of `~/docker/hosts`, and keep `REALM_NAME=meet`: the OIDC endpoints in `env.d/common` are built from it.

```dotenv
MEET_HOST=meet.example.com
IDP_HOST=auth.example.com
LIVEKIT_HOST=livekit.example.com
REALM_NAME=meet
LETSENCRYPT_EMAIL=you@example.com
```

The reverse proxy reaches every stack through the external `proxy` network. Create it once, before the first stack:

```bash
docker network create proxy
```

---

## Stack 1: Reverse proxy

Already have a reverse proxy? Check that it routes the hostnames in [Reverse Proxy](reverse-proxy.md), and skip to Stack 2. Otherwise, set up [nginx-proxy or Traefik](reverse-proxy.md#nginx-proxy-or-traefik).

---

## Stack 2: Identity provider

Meet logs users in through any OIDC provider. Already run one? Register a client for Meet there, per [SSO: Client configuration](../configuration/sso.md#client-configuration), note its endpoints and client secret, and skip to Stack 3. [SSO & Authentication](../configuration/sso.md) gives the values for Authentik, Google and others.

### Keycloak

This stack runs Keycloak on the same server, with a realm that already contains Meet's client.

!!! warning
    This Keycloak serves its admin console on the public `https://${IDP_HOST}`. Before production, harden it per the [official Keycloak documentation](https://www.keycloak.org/documentation).

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL -o compose.yml           ${RAW}/docs/examples/keycloak/compose.yml
curl -fsSL -o keycloak-realm.json   ${RAW}/docs/examples/keycloak/keycloak-realm.json

curl -fsSL -o env.d/keycloak        ${RAW}/env.d/production.dist/keycloak
curl -fsSL -o env.d/kc_postgresql   ${RAW}/env.d/production.dist/kc_postgresql
cp ~/docker/hosts .env
```

The override connects Keycloak to your reverse proxy, so download the one for yours:

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

The downloaded files hold placeholders, not passwords. Generate secrets and write them into `env.d/`:

```bash
KC_ADMIN_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_CLIENT_SECRET=$(openssl rand -hex 16)
# Only this one is typed into a browser by a human, so keep it short.
MEET_ADMIN_PASSWORD=$(openssl rand -base64 12)

sed -i "s|KC_BOOTSTRAP_ADMIN_PASSWORD=.*|KC_BOOTSTRAP_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}|" env.d/keycloak
sed -i "s|POSTGRES_PASSWORD=<generate postgres password>|POSTGRES_PASSWORD=${KC_DB_PASSWORD}|" env.d/kc_postgresql
```

`env.d/kc_postgresql` sets `KC_DB_PASSWORD=${POSTGRES_PASSWORD}`, so `KC_DB_PASSWORD` needs no `sed` of its own.

!!!tip "Shortcut"
    [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) automates the two `sed` lines above:
    ```bash
    curl -fsSL -o generate-secrets.sh ${RAW}/docs/generate-secrets.sh
    chmod +x generate-secrets.sh
    ./generate-secrets.sh env.d/
    ```
    It doesn't touch `keycloak-realm.json`, so still generate `KC_CLIENT_SECRET` and `MEET_ADMIN_PASSWORD` yourself: both go into that file below.

!!! warning
    The realm ships with a placeholder password for the `meet-admin` user. Keycloak is on a public
    URL, so whoever reaches the login page first can claim the account with the placeholder: the
    "temporary" flag only forces a password change at *first* login. Always randomize it below.

Fill the four placeholders of `keycloak-realm.json`. The first line loads `MEET_HOST` from `.env`; `ADMIN_EMAIL` is the `meet-admin` account's email:

```bash
set -a; . ./.env; set +a
ADMIN_EMAIL=you@example.com

sed -i "s|REPLACE_ME|${KC_CLIENT_SECRET}|"                        keycloak-realm.json
sed -i "s|meet\.example\.com|${MEET_HOST}|g"                      keycloak-realm.json
sed -i "s|admin@example\.com|${ADMIN_EMAIL}|"                     keycloak-realm.json
sed -i "s|MEET_ADMIN_PASSWORD_PLACEHOLDER|${MEET_ADMIN_PASSWORD}|" keycloak-realm.json
```

Note down `MEET_ADMIN_PASSWORD` and `KC_CLIENT_SECRET` now: neither is stored in any `env.d/` file, and Stack 3 needs `KC_CLIENT_SECRET` again. Then start Keycloak:

```bash
docker compose up -d
```

It takes a short while to become ready:

```bash
docker compose ps   # keycloak should show 'healthy'
```

!!! info
    The admin console is at `https://${IDP_HOST}/admin/`. Log in with `admin` and the `KC_BOOTSTRAP_ADMIN_PASSWORD` value in `env.d/keycloak`.
    The Meet user is `meet-admin` / `${MEET_ADMIN_PASSWORD}` (the value you generated above). Keycloak
    will prompt for a new password on first login.

---

## Stack 3: Meet core

This stack runs Meet itself: backend, frontend, celery, PostgreSQL, Redis, and LiveKit, the media server that carries audio and video.

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

Write your host into the [webhook](../configuration/livekit.md#webhook) URL of `livekit-server.yaml`: the lobby, presence, telephony and recording rely on it.

```bash
set -a; . ./.env; set +a
sed -i "s|meet\.example\.com|${MEET_HOST}|" livekit-server.yaml
```

Download the override for your reverse proxy:

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

If you use Stack 2's Keycloak, write its client secret into `env.d/common`. In a new shell, first set the variable again with `KC_CLIENT_SECRET=<the value you noted>`:

```bash
sed -i "s|OIDC_RP_CLIENT_SECRET=.*|OIDC_RP_CLIENT_SECRET=${KC_CLIENT_SECRET}|" env.d/common
```

With another provider, set `OIDC_RP_CLIENT_SECRET` and the OIDC endpoints in `env.d/common` instead, per [SSO & Authentication](../configuration/sso.md).

The `celery` service receives tasks only once `CELERY_ENABLED=True` is set in `env.d/common`; without it, the backend runs them itself.

`env.d/common` sets `NUM_PROXIES=2`, for the reverse proxy and the frontend's nginx. A different proxy chain needs its own count, see [`NUM_PROXIES`](../../reference/env-variables.md#core).

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

`env.d/postgresql` sets `POSTGRES_PASSWORD=${DB_PASSWORD}`, so `POSTGRES_PASSWORD` needs no `sed` of its own. `LIVEKIT_API_SECRET` goes into both `env.d/common` and `livekit-server.yaml`: the backend and LiveKit authenticate each other with it.

!!!tip "Shortcut"
    [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) automates the block above, including the `livekit-server.yaml` patch:
    ```bash
    curl -fsSL -o generate-secrets.sh ${RAW}/docs/generate-secrets.sh
    chmod +x generate-secrets.sh
    ./generate-secrets.sh env.d/ livekit-server.yaml
    ```
    Set the client secret above first: while `OIDC_RP_CLIENT_SECRET` still holds its placeholder, the script fills it with a random value that your identity provider does not know.

### Start

```bash
docker compose up -d
```

The reverse proxy requests TLS certificates automatically once DNS has propagated.

### Run database migrations

Migrations create Meet's tables in the new database. Wait for the backend to become healthy, then run them:

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

Check every service before opening Meet in a browser:

```bash
docker compose ps
```

Every service shows `Up`. `backend` and `postgresql`, the two services with a health check, also show `(healthy)`.

Then check that each hostname responds over HTTPS with a valid certificate. Any HTTP status means the certificate works; the second command applies only to the Keycloak stack:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://meet.example.com/
curl -s -o /dev/null -w "%{http_code}\n" https://auth.example.com/realms/meet
curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
```

A `000` means curl could not connect or rejected the certificate, often because the certificate is not issued yet. See [TLS certificate not being issued](../../reference/troubleshooting.md#tls-certificate-not-being-issued).

Open `https://meet.example.com`. You should be redirected to your identity provider and, after login, land on the Meet home page.

---

## After installation

Work through these steps before using Meet in production.

**1. Test end-to-end**

Open `https://meet.example.com`, log in, create a meeting, and confirm audio and video work from a second browser tab or device. If media is missing, see [Troubleshooting](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).

**2. Configure email**

Required for room invitations and recording download links. Follow the Docker Compose section of [Email (SMTP)](../configuration/email.md#docker-compose-setup).

**3. Configure TURN**

TURN relays audio and video when a network blocks the direct path. Participants on corporate networks or VPNs may have no audio/video without it. See [TURN](../configuration/livekit.md#turn).

**4. Review security**

- Replace any placeholder value still left in `env.d/` or `keycloak-realm.json`
- Decide who can join rooms without logging in, see [Unauthenticated access](../configuration/sso.md#unauthenticated-access)
- See [Security](../../reference/security.md)

**5. Pin image versions**

`compose.yml` takes its image tags from `MEET_VERSION` and `LIVEKIT_VERSION`, and uses `latest` when they are unset. Pin them in `~/docker/meet/.env`:

```dotenv
MEET_VERSION=v1.36.3
LIVEKIT_VERSION=v1.13.6
```

Then apply the new tags from `~/docker/meet`:

```bash
docker compose up -d
```

Check the [changelog](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) for the latest stable version.

- Keycloak: set `KEYCLOAK_VERSION` in `~/docker/keycloak/.env` to a tag from the [Keycloak releases](https://github.com/keycloak/keycloak/releases), then run `docker compose up -d` there.
- The proxy: its `compose.yml` has no version variable, so set a full tag on each `image:` line. nginx-proxy's two images have none, and Traefik's `traefik:v3` follows every v3 release.

**6. Set up database backups**

Back up the database as in [Upgrading](../configuration/upgrade.md#before-upgrading); the restore is under [Rolling back](../configuration/upgrade.md#rolling-back). Store backups off-server and test restoration before relying on them.

**7. Add features**

- [Recording](../configuration/recording.md) - LiveKit Egress + Garage
- [AI Transcription](../configuration/transcription.md)

---

## Next

To keep Meet current, see [Upgrading](../configuration/upgrade.md). Common problems and their fixes are in [Troubleshooting](../../reference/troubleshooting.md).
