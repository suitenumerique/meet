# Deployment Guide

The [Quick Start](quick-start.md) script always installs its own reverse proxy and Keycloak.

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

- **You already run an OIDC provider**, such as Authentik or Google: register a client for Meet there, as [SSO: Client configuration](../configuration/sso.md#client-configuration) shows, note its client ID, client secret and endpoints, and skip to Stack 3.
- **You don't:** run Keycloak here, with a realm that already holds Meet's client.

### Download the files

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

# The script that fills the passwords
curl -fsSL -O $RAW/docs/generate-secrets.sh

# The stack and its realm
curl -fsSL --remote-name-all \
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

Give [`generate-secrets.sh`](https://github.com/suitenumerique/meet/blob/main/docs/generate-secrets.sh) the email of Meet's first user, `meet-admin`:

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
    Keycloak imports the realm once, at its first start, and never reads the file again. Run the script before that start, or the realm keeps its placeholder password and client secret. To start over, run `docker compose down -v`, which deletes Keycloak's database, then the script, then `docker compose up -d`.

### Start Keycloak

```console
$ docker compose up -d
$ docker compose ps --format 'table {{.Service}}\t{{.Status}}'
SERVICE      STATUS
keycloak     Up 2 minutes (healthy)
postgresql   Up 2 minutes (healthy)
```

Repeat the second command until both show `(healthy)`. If one never does, read its logs as the [Diagnostic checklist](../../reference/troubleshooting.md#diagnostic-checklist) shows.

!!! info
    Keycloak's admin console is at `https://${IDP_HOST}/admin/`: user `admin`, password `KC_BOOTSTRAP_ADMIN_PASSWORD` from `env.d/keycloak`. That account is [temporary](https://www.keycloak.org/server/bootstrap-admin-recovery): create your own admin account there, then delete `admin`.

## Stack 3: Meet core

Meet itself runs here: the backend, the frontend, Celery, PostgreSQL, Redis and LiveKit. What each one does is in [How Meet works](../../overview/how-meet-works.md#the-pieces).

### Download the files

```bash
mkdir -p ~/docker/meet/env.d && cd ~/docker/meet

RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

# The script that fills the secrets
curl -fsSL -O $RAW/docs/generate-secrets.sh

# The stack, LiveKit's settings, and the nginx that splits API and web app
curl -fsSL --remote-name-all \
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

[`NUM_PROXIES=2`](../../reference/env-variables.md#NUM_PROXIES) in `env.d/common` counts the reverse proxy and the frontend's nginx. Change it if more proxies sit in front, see [`NUM_PROXIES`](../../reference/env-variables.md#NUM_PROXIES).

### Fill in the secrets

!!! note "Another identity provider than Stack 2's Keycloak"
    First put its values in `env.d/common`, as [SSO & Authentication](../configuration/sso.md) shows. The script keeps them.

    - [`OIDC_RP_CLIENT_ID`](../../reference/env-variables.md#OIDC_RP_CLIENT_ID)
    - [`OIDC_RP_CLIENT_SECRET`](../../reference/env-variables.md#OIDC_RP_CLIENT_SECRET)
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
- [`OIDC_RP_CLIENT_SECRET`](../../reference/env-variables.md#OIDC_RP_CLIENT_SECRET): Meet's secret at the identity provider, read from Stack 2's `keycloak-realm.json`, or kept as you set it.
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

Repeat the second command until `backend` and `postgresql` show `(healthy)`. If one never does, read its logs as the [Diagnostic checklist](../../reference/troubleshooting.md#diagnostic-checklist) shows. The reverse proxy requests the TLS certificates once DNS has propagated.

### Create the tables and an admin account

```console
$ docker compose exec backend python manage.py migrate
System check identified some issues:

WARNINGS:
?: (dockerflow.health.W001) Unapplied migration admin.0001_initial
...
Operations to perform:
  Apply all migrations: ...
Running migrations:
  Applying contenttypes.0001_initial... OK
  ...
```

Then create an account for the admin panel, `https://meet.example.com/admin/`, which your identity provider's accounts cannot open. Put your own email and a strong password in the command:

```bash
docker compose exec backend python manage.py createsuperuser \
  --email you@example.com --password '<a strong password>'
```

### Verify

Put your three domains in the commands:

```console
$ curl -s -o /dev/null -w "%{http_code}\n" https://meet.example.com/
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://auth.example.com/realms/meet
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
200
```

Any HTTP status means the certificate works; `000` means it is not issued yet, see [TLS certificate not being issued](../../reference/troubleshooting.md#tls-certificate-not-being-issued). Check `auth.example.com` only with the Keycloak stack.

Then open `https://meet.example.com` and click **Login**: you reach your identity provider's login page and, after signing in, land back on the Meet home page. [Check your install](../verify.md) runs the full check, each step with its command and its expected output.

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

    With recording, pin `EGRESS_VERSION` there too, from the [Egress releases](https://github.com/livekit/egress/releases), and with telephony `LIVEKIT_SIP_VERSION`, from the [SIP bridge's tags](https://github.com/livekit/sip/tags). Pin Keycloak with `KEYCLOAK_VERSION` in `~/docker/keycloak/.env`, from its [releases](https://github.com/keycloak/keycloak/releases). The proxy's `compose.yml` has no version variable: put a full tag on each `image:` line.
6. **Back up the databases.** [Before upgrading](#before-upgrading) shows how for Meet's, and [Rolling back](#rolling-back) how to restore. With the Keycloak stack, which holds the accounts, dump its database too, from `~/docker/keycloak`:

    ```bash
    docker compose exec -T postgresql pg_dump -U keycloak keycloak > keycloak_backup_$(date +%Y%m%d).sql
    ```

    Keep backups off-server and test a restore.
7. **Add features.** Each optional feature links its setup guide in [Set up by your administrator](../../user/features-controls.md#set-up-by-your-administrator).

## Upgrading

### Before upgrading

1. **Read what changed** in [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) and [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md), for every version between yours and the target: only patch releases can be skipped.
2. **Back up the database**, from `~/docker/meet`:

    ```bash
    # -T disables the pseudo-terminal, so nothing but the dump reaches the file
    docker compose exec -T postgresql pg_dump -U meet meet > meet_backup_$(date +%Y%m%d).sql
    ```

3. **Note the version you run now**, to roll back to: `docker compose images backend` shows its tag.

### Upgrade Meet

1. Set `MEET_VERSION` in `.env` to the target release.
2. Download the images:

    ```bash
    docker compose pull
    ```

3. Apply any manual step UPGRADE.md lists for the target version.
4. Start the new images:

    ```bash
    docker compose up -d
    ```

5. Run the database migrations:

    ```bash
    docker compose exec backend python manage.py migrate
    ```

6. Check the backend started cleanly: `docker compose logs --tail=50 backend`.

### Rolling back

Restore the database from the backup taken before upgrading, then go back to the old version:

```bash
# Stop the backend and workers
docker compose stop backend celery

# Move the migrated database aside, then restore into an empty one: a restore
# over the migrated schema keeps the new tables and columns
docker compose exec -T postgresql psql -U meet -d postgres \
  -c "ALTER DATABASE meet RENAME TO meet_before_rollback"
docker compose exec -T postgresql createdb -U meet meet
docker compose exec -T postgresql psql -U meet -v ON_ERROR_STOP=1 meet < meet_backup_YYYYMMDD.sql

# Set MEET_VERSION in .env back to the previous version, then:
docker compose up -d
```

Once Meet works on the restored data, drop `meet_before_rollback`, which holds everything written since the upgrade; while it exists, the next rollback fails at the rename:

```bash
docker compose exec -T postgresql psql -U meet -d postgres \
  -c "DROP DATABASE meet_before_rollback"
```

### LiveKit, Egress and SIP

Check the [LiveKit releases](https://github.com/livekit/livekit/releases), then set the new tags in `LIVEKIT_VERSION`, `EGRESS_VERSION` with recording and `LIVEKIT_SIP_VERSION` with telephony, in `.env`. A LiveKit restart drops the calls in progress, so pick a quiet hour:

```bash
# Without recording, leave out livekit-egress
# Without telephony, leave out livekit-sip
docker compose up -d livekit livekit-egress livekit-sip
```

## Stop or remove

Each stack stops from its own directory, `~/docker/meet` for Meet:

```bash
# Remove the containers; the data stays in the stack's volumes
docker compose down

# Remove the containers and delete the volumes
docker compose down -v
```

`-v` deletes the stack's data: Meet's database in `meet_db`, Keycloak's in `kc_db`, or nginx-proxy's certificates, which [Let's Encrypt](https://letsencrypt.org/docs/rate-limits/) reissues only a few times a week. Traefik keeps its certificates in `acme.json`. Once every stack is down, `docker network rm proxy` removes the shared network.
