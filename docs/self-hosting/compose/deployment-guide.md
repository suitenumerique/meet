# Deployment Guide

The [Quick Start](quick-start.md) script always installs its own reverse proxy and Keycloak. If you already run either, build the same stacks here by hand and skip yours. Read the [Prerequisites](prerequisites.md) first.

```
~/docker/
  nginx-proxy/   ← reverse proxy and TLS, or traefik/
  keycloak/      ← identity provider
  meet/          ← Meet core
```

## Before you start

Write your domains once in a `hosts` file; each stack copies it in as its `.env`. Then create the network the reverse proxy shares with every stack:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

mkdir -p ~/docker && cd ~/docker
curl -fsSL -o hosts ${RAW}/env.d/production.dist/hosts
docker network create proxy
```

Edit the four host and email lines of `~/docker/hosts`, and keep `REALM_NAME=meet`: the OIDC endpoints are built from it.

```dotenv
MEET_HOST=meet.example.com
IDP_HOST=auth.example.com
LIVEKIT_HOST=livekit.example.com
REALM_NAME=meet
LETSENCRYPT_EMAIL=you@example.com
```

## Stack 1: Reverse proxy

Already have a reverse proxy? Check that it routes the hostnames in [What the proxy must route](reverse-proxy.md#what-the-proxy-must-route), and skip to Stack 2. Otherwise, follow the [Reverse Proxy guide](reverse-proxy.md#nginx-proxy-or-traefik), then come back for Stack 2.

## Stack 2: Identity provider

Already run an OIDC provider, such as Authentik or Google? Register a client for Meet there, per [SSO: Client configuration](../configuration/sso.md#client-configuration), note its endpoints and client secret, and skip to Stack 3. Otherwise, run Keycloak here, with a realm that already holds Meet's client:

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL -o compose.yml           ${RAW}/docs/examples/keycloak/compose.yml
curl -fsSL -o keycloak-realm.json   ${RAW}/docs/examples/keycloak/keycloak-realm.json
curl -fsSL -o env.d/keycloak        ${RAW}/env.d/production.dist/keycloak
curl -fsSL -o env.d/kc_postgresql   ${RAW}/env.d/production.dist/kc_postgresql
curl -fsSL -o generate-secrets.sh   ${RAW}/docs/generate-secrets.sh
cp ~/docker/hosts .env
```

Download the override for your reverse proxy:

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

Fill the placeholders. [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) writes the passwords into `env.d/`; the realm takes four more values:

```bash
bash generate-secrets.sh env.d/

set -a; . ./.env; set +a                         # loads MEET_HOST
KC_CLIENT_SECRET=$(openssl rand -hex 16)
MEET_ADMIN_PASSWORD=$(openssl rand -base64 12)   # typed by hand at first login, so short
ADMIN_EMAIL=you@example.com                      # the meet-admin account's email

sed -i "s|REPLACE_ME|${KC_CLIENT_SECRET}|"                        keycloak-realm.json
sed -i "s|meet\.example\.com|${MEET_HOST}|g"                      keycloak-realm.json
sed -i "s|admin@example\.com|${ADMIN_EMAIL}|"                     keycloak-realm.json
sed -i "s|MEET_ADMIN_PASSWORD_PLACEHOLDER|${MEET_ADMIN_PASSWORD}|" keycloak-realm.json
```

!!! warning
    Keycloak is public, and the realm ships `meet-admin` with a placeholder password: whoever logs in with it first claims the account. The last line is what prevents that.

Note `MEET_ADMIN_PASSWORD` and `KC_CLIENT_SECRET`, which Stack 3 needs, then start Keycloak:

```bash
docker compose up -d
docker compose ps   # wait until keycloak shows 'healthy'
```

!!! info
    The admin console is at `https://${IDP_HOST}/admin/`: log in with `admin` and the `KC_BOOTSTRAP_ADMIN_PASSWORD` in `env.d/keycloak`, and harden it before production, per the [Keycloak documentation](https://www.keycloak.org/documentation). The Meet user is `meet-admin` with `MEET_ADMIN_PASSWORD`; Keycloak asks for a new password at first login.

## Stack 3: Meet core

Meet itself: the backend, the frontend, Celery, PostgreSQL, Redis and LiveKit.

```bash
mkdir -p ~/docker/meet/env.d && cd ~/docker/meet

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL -o compose.yml          ${RAW}/docs/examples/meet/compose.yml
curl -fsSL -o livekit-server.yaml  ${RAW}/docs/examples/meet/livekit-server.yaml
curl -fsSL -o nginx-routing.conf   ${RAW}/docs/examples/meet/nginx-routing.conf
curl -fsSL -o env.d/common         ${RAW}/env.d/production.dist/common
curl -fsSL -o env.d/postgresql     ${RAW}/env.d/production.dist/postgresql
curl -fsSL -o generate-secrets.sh  ${RAW}/docs/generate-secrets.sh
cp ~/docker/hosts .env
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

Fill the placeholders. The client secret goes in first, since the script would otherwise fill it with a random value your identity provider does not know:

```bash
set -a; . ./.env; set +a
sed -i "s|meet\.example\.com|${MEET_HOST}|" livekit-server.yaml   # the webhook URL

# In a new shell, first: KC_CLIENT_SECRET=<the value you noted>
sed -i "s|OIDC_RP_CLIENT_SECRET=.*|OIDC_RP_CLIENT_SECRET=${KC_CLIENT_SECRET}|" env.d/common

bash generate-secrets.sh env.d/ livekit-server.yaml
```

With another identity provider, put its client secret and endpoints in `env.d/common` instead, per [SSO & Authentication](../configuration/sso.md). `env.d/common` counts two proxies, the reverse proxy and the frontend's nginx; another chain needs its own [`NUM_PROXIES`](../../reference/env-variables.md#core).

### Start

Start the stack, create Meet's tables, and create an account for the admin panel at `https://meet.example.com/admin/`, which your identity provider's accounts cannot open:

```bash
docker compose up -d
docker compose ps   # wait until backend shows 'healthy'
docker compose exec backend python manage.py migrate   # every line ends with OK
docker compose exec backend python manage.py createsuperuser \
  --email you@example.com --password '<a strong password>'
```

The reverse proxy requests the TLS certificates once DNS has propagated.

### Verify

```bash
docker compose ps
```

Every service shows `Up`, and `backend` and `postgresql` also show `(healthy)`. Then check each hostname's certificate. Any HTTP status means it works; `000` means it is not issued yet, see [TLS certificate not being issued](../../reference/troubleshooting.md#tls-certificate-not-being-issued).

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://meet.example.com/
curl -s -o /dev/null -w "%{http_code}\n" https://auth.example.com/realms/meet   # Keycloak stack only
curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
```

Open `https://meet.example.com` and click **Login**: you reach your identity provider's login page and, after signing in, land back on the Meet home page.

## After installation

Before using Meet in production:

1. **Test a call.** Create a meeting and confirm audio and video from a second device. If media is missing, see [Troubleshooting](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).
2. **Set up email.** Invitations and recording links need it, see [Email (SMTP)](../configuration/email.md#docker-compose-setup).
3. **Set up TURN.** Without [TURN](../configuration/livekit.md#turn), participants behind some corporate networks or VPNs get no audio or video.
4. **Review security.** Decide who joins without signing in, see [Unauthenticated access](../configuration/sso.md#unauthenticated-access), and read [Security](../../reference/security.md).
5. **Pin image versions.** `compose.yml` uses `latest` until you set versions. Take the latest stable ones from the [changelog](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md), put them in `~/docker/meet/.env`, then run `docker compose up -d` there:

    ```dotenv
    MEET_VERSION=v1.36.3
    LIVEKIT_VERSION=v1.13.6
    ```

    Pin Keycloak with `KEYCLOAK_VERSION` in `~/docker/keycloak/.env`, from the [Keycloak releases](https://github.com/keycloak/keycloak/releases), and the proxy with a full tag on each `image:` line of its `compose.yml`.
6. **Back up the database**, as in [Upgrading](../configuration/upgrade.md#before-upgrading); the restore is under [Rolling back](../configuration/upgrade.md#rolling-back). Keep backups off-server and test a restore.
7. **Add features.** Each optional feature links its setup guide in [Set up by your administrator](../../user/features-controls.md#set-up-by-your-administrator).
