# Deployment Guide

The [Quick Start](quick-start.md) script always installs its own reverse proxy and Keycloak. If you already run one of them, build the stacks by hand here instead, leaving out the one you have.

```
~/docker/
  nginx-proxy/   ← reverse proxy and TLS, or traefik/
  keycloak/      ← identity provider
  meet/          ← Meet core
```

## Before you start

Check the [Prerequisites](prerequisites.md) first. Every stack reads your domains from one `hosts` file and reaches the reverse proxy through one `proxy` network. Create both:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

mkdir -p ~/docker && cd ~/docker
# Your domains, edited next
curl -fsSL -o hosts $RAW/env.d/production.dist/hosts

# The network the proxy shares with every stack
docker network create proxy
```

Edit the four host and email lines of `~/docker/hosts`, and keep `REALM_NAME=meet`: the [OIDC](https://openid.net/developers/how-connect-works/) endpoints are built from it.

```dotenv
MEET_HOST=meet.example.com
IDP_HOST=auth.example.com
LIVEKIT_HOST=livekit.example.com
REALM_NAME=meet
LETSENCRYPT_EMAIL=you@example.com
```

## Stack 1: Reverse proxy

- **You already run one:** check that it routes the hostnames in [What the proxy must route](reverse-proxy.md#what-the-proxy-must-route), then skip to Stack 2.
- **You don't:** follow the [Reverse Proxy guide](reverse-proxy.md#nginx-proxy-or-traefik), then come back for Stack 2.

## Stack 2: Identity provider

- **You already run an OIDC provider**, such as Authentik or Google: register a client for Meet there, as [SSO: Client configuration](../configuration/sso.md#client-configuration) shows, note its endpoints and client secret, and skip to Stack 3.
- **You don't:** run Keycloak here, with a realm that already holds Meet's client.

### Download the files

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

# The stack, its realm, and the script that fills the passwords
curl -fsSL --remote-name-all $RAW/docs/generate-secrets.sh \
  $RAW/docs/examples/keycloak/{compose.yml,keycloak-realm.json}

# The settings of Keycloak and of its database
curl -fsSL --output-dir env.d --remote-name-all \
  $RAW/env.d/production.dist/{keycloak,kc_postgresql}

# Your domains
cp ~/docker/hosts .env
```

Then the override that connects Keycloak to your reverse proxy:

=== "nginx-proxy"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      $RAW/docs/examples/keycloak/docker-compose.override.yml.nginx
    ```

=== "Traefik"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      $RAW/docs/examples/keycloak/docker-compose.override.yml.traefik
    ```

### Fill in the passwords

Give the script the email of Meet's first user, `meet-admin`:

```console
$ ADMIN_EMAIL=you@example.com bash generate-secrets.sh
set POSTGRES_PASSWORD in kc_postgresql
set KC_BOOTSTRAP_ADMIN_PASSWORD in keycloak
set the client secret, domain and meet-admin in keycloak-realm.json

meet-admin's first password: EEtpDBXfTkH91JS1
```

Keep that password: meet-admin signs in with it once, then picks a new one. The script also set:

- `POSTGRES_PASSWORD`: Keycloak's database.
- `KC_BOOTSTRAP_ADMIN_PASSWORD`: Keycloak's admin console.
- The client secret in `keycloak-realm.json`, which Stack 3 reads.

!!! warning
    Run the script before starting Keycloak: until then, anyone could claim `meet-admin` with the realm's placeholder password.

### Start Keycloak

```console
$ docker compose up -d
$ docker compose ps --format 'table {{.Service}}\t{{.Status}}'
SERVICE      STATUS
keycloak     Up 2 minutes (healthy)
postgresql   Up 2 minutes (healthy)
```

Repeat the second command until both show `(healthy)`.

!!! info
    Keycloak's admin console is at `https://${IDP_HOST}/admin/`: user `admin`, password `KC_BOOTSTRAP_ADMIN_PASSWORD` from `env.d/keycloak`. That account is [temporary](https://www.keycloak.org/server/bootstrap-admin-recovery): create your own admin account there, then delete it.

## Stack 3: Meet core

Meet itself runs here: the backend, the frontend, Celery, PostgreSQL, Redis and LiveKit.

### Download the files

```bash
mkdir -p ~/docker/meet/env.d && cd ~/docker/meet

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

# The stack, LiveKit's settings, the nginx that splits API and web app, and the script
curl -fsSL --remote-name-all $RAW/docs/generate-secrets.sh \
  $RAW/docs/examples/meet/{compose.yml,livekit-server.yaml,nginx-routing.conf}

# The settings of Meet and of its database
curl -fsSL --output-dir env.d --remote-name-all \
  $RAW/env.d/production.dist/{common,postgresql}

# Your domains
cp ~/docker/hosts .env
```

Then the override that connects Meet to your reverse proxy:

=== "nginx-proxy"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      $RAW/docs/examples/meet/docker-compose.override.yml.nginx
    ```

=== "Traefik"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      $RAW/docs/examples/meet/docker-compose.override.yml.traefik
    ```

`NUM_PROXIES=2` in `env.d/common` counts the reverse proxy and the frontend's nginx. Change it if more proxies sit in front, see [`NUM_PROXIES`](../../reference/env-variables.md#NUM_PROXIES).

### Fill in the secrets

!!! note "Another identity provider than Stack 2's Keycloak"
    First put its values in `env.d/common`, as [SSO & Authentication](../configuration/sso.md) shows. The script keeps them.

    - `OIDC_RP_CLIENT_ID`
    - `OIDC_RP_CLIENT_SECRET`
    - the `OIDC_OP_*` endpoints

```console
$ bash generate-secrets.sh
set DJANGO_SECRET_KEY in common
set LIVEKIT_API_SECRET in common
set OIDC_RP_CLIENT_SECRET in common
set DB_PASSWORD in postgresql
set the webhook domain in livekit-server.yaml
set LIVEKIT_API_SECRET in livekit-server.yaml
```

What each one is:

- [`DJANGO_SECRET_KEY`](../../reference/env-variables.md#DJANGO_SECRET_KEY): Django's signing key.
- [`LIVEKIT_API_SECRET`](../../reference/env-variables.md#LIVEKIT_API_SECRET): shared by Meet and LiveKit.
- [`OIDC_RP_CLIENT_SECRET`](../../reference/env-variables.md#OIDC_RP_CLIENT_SECRET): Meet's secret at the identity provider, read from Stack 2's `keycloak-realm.json`.
- [`DB_PASSWORD`](../../reference/env-variables.md#DB_PASSWORD): Meet's database.

### Start Meet

```console
$ docker compose up -d
$ docker compose ps --format 'table {{.Service}}\t{{.Status}}'
SERVICE      STATUS
backend      Up 2 minutes (healthy)
celery       Up 2 minutes
frontend     Up 2 minutes
livekit      Up 2 minutes
postgresql   Up 2 minutes (healthy)
redis        Up 2 minutes
```

Repeat the second command until `backend` and `postgresql` show `(healthy)`. The reverse proxy requests the TLS certificates once DNS has propagated.

### Create the tables and an admin account

```console
$ docker compose exec backend python manage.py migrate
Operations to perform:
  Apply all migrations: ...
Running migrations:
  Applying contenttypes.0001_initial... OK
  ...
```

`migrate` creates Meet's tables. Then create an account for the admin panel, `https://meet.example.com/admin/`, which your identity provider's accounts cannot open. Put your own email and a strong password in the command:

```bash
docker compose exec backend python manage.py createsuperuser \
  --email you@example.com --password '<a strong password>'
```

### Verify

```console
$ curl -s -o /dev/null -w "%{http_code}\n" https://meet.example.com/
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://auth.example.com/realms/meet
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
200
```

Any HTTP status means the certificate works; `000` means it is not issued yet, see [TLS certificate not being issued](../../reference/troubleshooting.md#tls-certificate-not-being-issued). Check `auth.example.com` only with the Keycloak stack.

Then open `https://meet.example.com` and click **Login**: you reach your identity provider's login page and, after signing in, land back on the Meet home page.

## After installation

Before using Meet in production:

1. **Test a call.** Create a meeting and check that audio and video work from a second device. If media is missing, see [Troubleshooting](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).
2. **Set up email.** Invitations and recording links need it, see [Email (SMTP)](../configuration/email.md#docker-compose-setup).
3. **Set up TURN.** Without [TURN](../configuration/livekit.md#turn), participants behind some corporate networks or VPNs get no audio or video.
4. **Review security.** Decide who joins without signing in, see [Unauthenticated access](../configuration/sso.md#unauthenticated-access), and read [Security](../../reference/security.md).
5. **Pin image versions.** `compose.yml` uses `latest` until you set versions. Take the latest stable ones from the [changelog](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md), put them in `~/docker/meet/.env`, then run `docker compose up -d` there:

    ```dotenv
    MEET_VERSION=v1.36.3
    LIVEKIT_VERSION=v1.13.6
    ```

    Pin Keycloak with `KEYCLOAK_VERSION` in `~/docker/keycloak/.env`, from its [releases](https://github.com/keycloak/keycloak/releases). The proxy's `compose.yml` has no version variable: put a full tag on each `image:` line.
6. **Back up the database.** [Upgrading](../configuration/upgrade.md#before-upgrading) shows how, and [Rolling back](../configuration/upgrade.md#rolling-back) how to restore. Keep backups off-server and test a restore.
7. **Add features.** Each optional feature links its setup guide in [Set up by your administrator](../../user/features-controls.md#set-up-by-your-administrator).
