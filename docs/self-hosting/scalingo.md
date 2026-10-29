# Deployment on Scalingo

Take this path when your apps already run on [Scalingo](https://scalingo.com/): Meet becomes one more app there, built by the [Suite Numérique buildpack](https://github.com/suitenumerique/buildpack), with PostgreSQL and Redis addons. LiveKit, the media server, still runs elsewhere.

To only try Meet, run [Quick Start](compose/quick-start.md) on a single server first.

## Prerequisites

- A Scalingo account
- The [Scalingo CLI](https://doc.scalingo.com/tools/cli/start)
- An [OIDC](https://openid.net/developers/how-connect-works/) provider, the identity service that signs users in, with a client for Meet
- A [LiveKit](https://livekit.io/) server running elsewhere, see [LiveKit](#livekit)

## Step 1: Create the app and its addons

Create the app with the `scalingo` CLI or the [Scalingo dashboard](https://dashboard.scalingo.com/), then add the PostgreSQL and Redis addons. They set `SCALINGO_POSTGRESQL_URL` and `SCALINGO_REDIS_URL`.

## Step 2: Set the environment variables

### Buildpack

Point the app at the buildpack and at Meet's backend, frontend, nginx config and build scripts:

```bash
scalingo env-set BUILDPACK_URL="https://github.com/suitenumerique/buildpack#main"
scalingo env-set LASUITE_APP_NAME="meet"
scalingo env-set LASUITE_BACKEND_DIR="."
scalingo env-set LASUITE_FRONTEND_DIR="src/frontend/"
scalingo env-set LASUITE_NGINX_DIR="."
scalingo env-set LASUITE_SCRIPT_POSTCOMPILE="bin/buildpack_postcompile.sh"
scalingo env-set LASUITE_SCRIPT_POSTFRONTEND="bin/buildpack_postfrontend.sh"
```

### Database and cache

Point Meet at the addons' URLs. The `\$` stops your shell from expanding the variable, so Scalingo receives the reference as written:

```bash
scalingo env-set DATABASE_URL="\$SCALINGO_POSTGRESQL_URL"
scalingo env-set REDIS_URL="\$SCALINGO_REDIS_URL"
```

### Django

Run Django in [production mode](../reference/env-variables.md#DJANGO_CONFIGURATION). Replace `my-meet-app.osc-fr1.scalingo.io` with your app's [hostname](../reference/env-variables.md#DJANGO_ALLOWED_HOSTS); the [secret key](../reference/env-variables.md#DJANGO_SECRET_KEY) is generated on its line:

```bash
scalingo env-set DJANGO_SETTINGS_MODULE="meet.settings"
scalingo env-set DJANGO_CONFIGURATION="Production"
scalingo env-set DJANGO_SECRET_KEY="$(openssl rand -hex 32)"
scalingo env-set DJANGO_ALLOWED_HOSTS="my-meet-app.osc-fr1.scalingo.io"
```

### OIDC

Point Meet at your [OIDC provider](../reference/env-variables.md#authentication-oidc) and its client for Meet. Replace `auth.yourdomain.com` and `<your-client-secret>`, the [client secret](../reference/env-variables.md#OIDC_RP_CLIENT_SECRET), with your provider's. The example uses Keycloak's endpoints; [SSO & Authentication](configuration/sso.md) has them for other providers:

```bash
OIDC="https://auth.yourdomain.com/realms/meet/protocol/openid-connect"

scalingo env-set OIDC_OP_JWKS_ENDPOINT="$OIDC/certs"
scalingo env-set OIDC_OP_AUTHORIZATION_ENDPOINT="$OIDC/auth"
scalingo env-set OIDC_OP_TOKEN_ENDPOINT="$OIDC/token"
scalingo env-set OIDC_OP_USER_ENDPOINT="$OIDC/userinfo"
scalingo env-set OIDC_OP_LOGOUT_ENDPOINT="$OIDC/logout"
scalingo env-set OIDC_RP_CLIENT_ID="meet"
scalingo env-set OIDC_RP_CLIENT_SECRET="<your-client-secret>"
scalingo env-set OIDC_RP_SIGN_ALGO="RS256"
```

### LiveKit

Run LiveKit elsewhere, with [LiveKit on Kubernetes](kubernetes/helm.md#livekit-on-kubernetes) or the `livekit` service of the [Docker Compose stack](compose/deployment-guide.md#stack-3-meet-core), then point Meet at it. Replace the URL and the two `<your-livekit-…>` values with that server's:

```bash
scalingo env-set LIVEKIT_API_URL="https://livekit.yourdomain.com"
scalingo env-set LIVEKIT_API_KEY="<your-livekit-api-key>"
scalingo env-set LIVEKIT_API_SECRET="<your-livekit-api-secret>"
```

### Email

Invitations and recording links need it, see [Email (SMTP)](configuration/email.md#scalingo-setup).

## Step 3: Deploy

Push the code to build and start the app:

```bash
git push scalingo main
```

The `postdeploy` line of `Procfile` runs the database migrations on each deployment.

## Step 4: Create an admin account

After the first deployment, create an account that can open `/admin/`, with your email and a strong password in place of `<email>` and `<password>`:

```bash
scalingo run python manage.py createsuperuser --email <email> --password '<password>'
```

## Custom domain

Add the domain to the app, then list it in [`DJANGO_ALLOWED_HOSTS`](../reference/env-variables.md#DJANGO_ALLOWED_HOSTS) beside the Scalingo hostname. Replace `meet.yourdomain.com` with yours:

```bash
# Or add it in the dashboard
scalingo domains-add meet.yourdomain.com
HOSTS="meet.yourdomain.com,my-meet-app.osc-fr1.scalingo.io"
scalingo env-set DJANGO_ALLOWED_HOSTS="$HOSTS"
```

Then point your DNS to Scalingo.

## Custom logo

Set `CUSTOM_LOGO_URL` to the HTTPS URL of an SVG file, 5 MB at most, or the build fails. The build downloads the logo, so a change shows at the next deploy:

```bash
scalingo env-set CUSTOM_LOGO_URL="https://cdn.yourdomain.com/logo.svg"
```

## Troubleshooting

Follow the app's logs while you reproduce the problem:

```bash
scalingo logs --tail
```

Common problems and their fixes are in [Troubleshooting](../reference/troubleshooting.md).

## Additional resources

- [Scalingo Documentation](https://doc.scalingo.com/)
- [Meet Environment Variables](../reference/env-variables.md)
- [Django Configurations Documentation](https://django-configurations.readthedocs.io/)

## Next

Continue with [Next steps](index.md#next-steps).
