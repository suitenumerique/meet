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

**Prerequisites:** Complete the [Prerequisites](prerequisites.md) checklist first. DNS must resolve before you start - Let's Encrypt needs it.

---

## Before you start: configure your domains

All three stacks share the same domain names. Download the hosts file once and edit it - each stack will copy it in later.

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/main"

mkdir -p ~/docker && cd ~/docker
curl -fsSL -o hosts ${RAW}/env.d/production.dist/hosts
```

Edit `~/docker/hosts`:

```dotenv
MEET_HOST=meet.example.com
IDP_HOST=auth.example.com
LIVEKIT_HOST=livekit.example.com
```

All three domains must have DNS A records pointing to your server before you proceed. Let's Encrypt verifies DNS during certificate issuance.

---

## Stack 1: Reverse proxy

Skip this section if you already have a reverse proxy running and attached to the `proxy` network.

Follow the setup guide for your chosen proxy - each covers the full setup, how Meet services integrate, DNS requirements, and troubleshooting:

- [nginx-proxy + acme-companion](nginx.md) - recommended for new deployments
- [Traefik](traefik.md)

Once your proxy is running, continue to Stack 2.

---

## Stack 2: Identity provider

Skip this section if you already have an OIDC provider. If you do, note down your OIDC endpoints and client credentials - you will need them in Stack 3. See [SSO & Authentication](../configuration/sso.md) for configuration instructions for each provider.

!!! warning 
    **These instructions are provided as a quick-start example using Keycloak.** 
    
    For production environments, read the [official Keycloak documentation](https://www.keycloak.org/documentation)..

```bash
mkdir -p ~/docker/keycloak/env.d && cd ~/docker/keycloak

RAW="https://raw.githubusercontent.com/suitenumerique/meet/main"

curl -fsSL -o compose.yml           ${RAW}/docs/docs/examples/keycloak/compose.yml
curl -fsSL -o keycloak-realm.json   ${RAW}/docs/docs/examples/keycloak/keycloak-realm.json

curl -fsSL -o env.d/keycloak        ${RAW}/env.d/production.dist/keycloak
curl -fsSL -o env.d/kc_postgresql   ${RAW}/env.d/production.dist/kc_postgresql
cp ~/docker/hosts env.d/hosts
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
# Load domain variables from the hosts file
set -a && source env.d/hosts && set +a

KC_ADMIN_PASSWORD=$(openssl rand -hex 16)
KC_DB_PASSWORD=$(openssl rand -hex 16)
KC_CLIENT_SECRET=$(openssl rand -hex 16)

sed -i "s|KC_BOOTSTRAP_ADMIN_PASSWORD=.*|KC_BOOTSTRAP_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}|" env.d/keycloak
sed -i "s|POSTGRES_PASSWORD=<generate postgres password>|POSTGRES_PASSWORD=${KC_DB_PASSWORD}|" env.d/kc_postgresql
sed -i "s|KC_DB_PASSWORD=<generate postgres password>|KC_DB_PASSWORD=${KC_DB_PASSWORD}|"      env.d/kc_postgresql
```

Edit `keycloak-realm.json` - replace three placeholders:

```bash
sed -i "s|REPLACE_ME|${KC_CLIENT_SECRET}|"       keycloak-realm.json
sed -i "s|meet\.example\.com|${MEET_HOST}|g"     keycloak-realm.json
```

And set your email in `keycloak-realm.json`

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
    The default Meet user is `meet-admin` / `ChangeMe!`, change this password after first login.

---

## Stack 3: Meet core

```bash
mkdir -p ~/docker/meet/env.d && cd ~/docker/meet

RAW="https://raw.githubusercontent.com/suitenumerique/meet/main"

curl -fsSL -o compose.yml         ${RAW}/docs/docs/examples/meet/compose.yml
curl -fsSL -o livekit-server.yaml ${RAW}/docs/docs/examples/meet/livekit-server.yaml
curl -fsSL -o nginx-routing.conf  ${RAW}/docs/docs/examples/meet/nginx-routing.conf
curl -fsSL -o generate-secrets.sh ${RAW}/docs/docs/generate-secrets.sh
chmod +x generate-secrets.sh

curl -fsSL -o env.d/common     ${RAW}/env.d/production.dist/common
curl -fsSL -o env.d/postgresql ${RAW}/env.d/production.dist/postgresql
cp ~/docker/hosts env.d/hosts
```

Copy the proxy override:

=== "nginx-proxy"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/docs/examples/meet/docker-compose.override.yml.nginx
    ```

=== "Traefik"

    ```bash
    curl -fsSL -o docker-compose.override.yml \
      ${RAW}/docs/docs/examples/meet/docker-compose.override.yml.traefik
    ```

If using Keycloak from Stack 2, set the OIDC client secret in `env.d/common`:

```bash
sed -i "s|OIDC_RP_CLIENT_SECRET=.*|OIDC_RP_CLIENT_SECRET=${KC_CLIENT_SECRET}|" env.d/common
```

If using an existing OIDC provider, also update the OIDC endpoints in `env.d/common`. See [SSO & Authentication](../configuration/sso.md) for per-provider instructions. For documentation on every variable, see the [Environment Variables reference](../../reference/env-variables.md).

### Generate secrets

```bash
./generate-secrets.sh env.d/ livekit-server.yaml
```

This writes all secrets into the correct `env.d/` files and patches `livekit-server.yaml` automatically.

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

Email is required for recording download notifications. Edit `env.d/common`:

```dotenv
DJANGO_EMAIL_HOST=smtp.example.com
DJANGO_EMAIL_PORT=587
DJANGO_EMAIL_HOST_USER=meet@example.com
DJANGO_EMAIL_HOST_PASSWORD=<password>
DJANGO_EMAIL_USE_TLS=True
DJANGO_EMAIL_FROM=meet@example.com
```

Restart: `docker compose up -d --force-recreate backend celery`

**3. Configure TURN**

Participants on corporate networks or VPNs may have no audio/video without TURN. See [TURN Server](../configuration/turn.md).

**4. Review security**

- Rotate all secrets if any placeholder values remain
- Set `ALLOW_UNREGISTERED_ROOMS=False` in `env.d/common` to require login for all rooms
- Keep the LiveKit API secret 32+ characters - treat it like a database password
- See [Security](../../reference/security.md)

**5. Pin image versions**

`compose.yml` uses `:latest` by default. Pin versions in production:

```yaml
backend:
  image: lasuite/meet-backend:1.21.0
frontend:
  image: lasuite/meet-frontend:1.21.0
```

Check the [Changelog](../../overview/changelog.md) for the latest stable version.

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

**App returns 404 on all routes**
`DJANGO_SETTINGS_MODULE` is missing. Check `env.d/common` contains `DJANGO_SETTINGS_MODULE=meet.settings` and restart:
```bash
docker compose restart backend
```

**502 Bad Gateway**
The frontend nginx is not reaching the backend. Check:
```bash
docker compose logs frontend
docker compose logs backend
```

**Infinite redirect loop**
`X-Forwarded-Proto https` is not hardcoded in `nginx-routing.conf`. Verify the file was downloaded correctly - it must not use `$scheme`.

**"Invalid parameter: redirect_uri" from Keycloak**
The redirect URI must be exactly `https://meet.example.com/api/v1.0/callback/` (note the versioned path and trailing slash). 

If using Keycloak, fix it in  admin console: Clients → meet → Settings → Valid redirect URIs.

**Disconnected from meeting immediately**
`LIVEKIT_API_URL` in `env.d/common` is set to the Docker-internal address. It must be the public HTTPS URL: `https://livekit.example.com`.

**No audio or video after joining**
A media port is blocked. Verify `7881/TCP` and `7882/UDP` are open - see [Firewall & Ports](../configuration/firewall.md).

