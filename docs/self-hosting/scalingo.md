# Deployment on Scalingo

This guide explains how to deploy LaSuite Meet on [Scalingo](https://scalingo.com/) using the [Suite Numérique buildpack](https://github.com/suitenumerique/buildpack).

## Prerequisites

- A Scalingo account
- The Scalingo CLI, which the commands below use

## Step 1: Create Your App

Create an app with the `scalingo` CLI or the [Scalingo dashboard](https://dashboard.scalingo.com/).

## Step 2: Provision Addons

Add a PostgreSQL addon and a Redis addon, for caching and sessions. They set these environment variables automatically:

- `SCALINGO_POSTGRESQL_URL` - Database connection string
- `SCALINGO_REDIS_URL` - Redis connection string

## Step 3: Configure Environment Variables

### Buildpack Configuration

Point the app at the buildpack, and tell it where Meet's backend, frontend, nginx config and build scripts are:

```bash
scalingo env-set BUILDPACK_URL="https://github.com/suitenumerique/buildpack#main"
scalingo env-set LASUITE_APP_NAME="meet"
scalingo env-set LASUITE_BACKEND_DIR="."
scalingo env-set LASUITE_FRONTEND_DIR="src/frontend/"
scalingo env-set LASUITE_NGINX_DIR="."
scalingo env-set LASUITE_SCRIPT_POSTCOMPILE="bin/buildpack_postcompile.sh"
scalingo env-set LASUITE_SCRIPT_POSTFRONTEND="bin/buildpack_postfrontend.sh"
```

### Database and Cache

Point Meet at the addons' URLs. The `\$` stops your shell from expanding the variable, so Scalingo receives the reference as written:

```bash
scalingo env-set DATABASE_URL="\$SCALINGO_POSTGRESQL_URL"
scalingo env-set REDIS_URL="\$SCALINGO_REDIS_URL"
```

### Django Settings

Select the production configuration, and set a secret key and the app's hostname:

```bash
scalingo env-set DJANGO_SETTINGS_MODULE="meet.settings"
scalingo env-set DJANGO_CONFIGURATION="Production"
scalingo env-set DJANGO_SECRET_KEY="<generate-a-secure-secret-key>"
scalingo env-set DJANGO_ALLOWED_HOSTS="my-meet-app.osc-fr1.scalingo.io"
```

### OIDC Authentication

Point Meet at your OIDC provider, Keycloak or Authentik for example, and at its client for Meet:

```bash
scalingo env-set OIDC_OP_JWKS_ENDPOINT="https://auth.yourdomain.com/realms/meet/protocol/openid-connect/certs"
scalingo env-set OIDC_OP_AUTHORIZATION_ENDPOINT="https://auth.yourdomain.com/realms/meet/protocol/openid-connect/auth"
scalingo env-set OIDC_OP_TOKEN_ENDPOINT="https://auth.yourdomain.com/realms/meet/protocol/openid-connect/token"
scalingo env-set OIDC_OP_USER_ENDPOINT="https://auth.yourdomain.com/realms/meet/protocol/openid-connect/userinfo"
scalingo env-set OIDC_OP_LOGOUT_ENDPOINT="https://auth.yourdomain.com/realms/meet/protocol/openid-connect/logout"
scalingo env-set OIDC_RP_CLIENT_ID="meet"
scalingo env-set OIDC_RP_CLIENT_SECRET="<your-client-secret>"
scalingo env-set OIDC_RP_SIGN_ALGO="RS256"
```

### LiveKit Configuration

Meet requires a LiveKit server for video conferencing, which this guide does not deploy. Run it elsewhere, with [LiveKit on Kubernetes](kubernetes/helm.md#livekit-on-kubernetes) or the `livekit` service of the [Docker Compose stack](compose/deployment-guide.md#stack-3-meet-core), then point Meet at it:

```bash
scalingo env-set LIVEKIT_API_URL="https://livekit.yourdomain.com"
scalingo env-set LIVEKIT_API_KEY="<your-livekit-api-key>"
scalingo env-set LIVEKIT_API_SECRET="<your-livekit-api-secret>"
```

### Email Configuration (Optional)

Follow the Scalingo section of [Email (SMTP)](configuration/email.md#scalingo-setup).

## Step 4: Deploy

Push the code to Scalingo, which builds and deploys it:

```bash
git push scalingo main
```

On deploy, the buildpack and the Procfile:
1. Build the frontend (Vite)
2. Build the backend (Django)
3. Run the post-compile script (cleanup)
4. Run the post-frontend script (move assets and prepare for deployment)
5. Run database migrations via the `postdeploy` process, before the app goes live
6. Start Nginx and Gunicorn (`web` process)

At runtime, `bin/buildpack_start.sh` runs both processes in the `web` container: Nginx serves the built frontend and proxies `/api/` and `/admin/` to Gunicorn, which runs Django.

## Step 5: Create superuser

After the first deployment, create an admin user:

```bash
scalingo run python manage.py createsuperuser --email <admin email> --password '<admin password>'
```

## Custom Domain (Optional)

Add the domain to the app, in the dashboard or with the first command, then list it in `DJANGO_ALLOWED_HOSTS` beside the Scalingo hostname:

```bash
scalingo domains-add meet.yourdomain.com
scalingo env-set DJANGO_ALLOWED_HOSTS="meet.yourdomain.com,my-meet-app.osc-fr1.scalingo.io"
```

Then point your DNS to Scalingo.

## Custom Logo (Optional)

Set `CUSTOM_LOGO_URL` to the HTTPS URL of an SVG file, 5 MB at most:

```bash
scalingo env-set CUSTOM_LOGO_URL="https://cdn.yourdomain.com/logo.svg"
```

## Troubleshooting

Follow the app's logs while you reproduce the problem:

```bash
scalingo logs --tail
```

Common problems and their fixes are in [Troubleshooting](../reference/troubleshooting.md).

## Additional Resources

- [Scalingo Documentation](https://doc.scalingo.com/)
- [Suite Numérique Buildpack](https://github.com/suitenumerique/buildpack)
- [Meet Environment Variables](../reference/env-variables.md)
- [Django Configurations Documentation](https://django-configurations.readthedocs.io/)
