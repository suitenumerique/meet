# Deployment on Scalingo

This guide explains how to deploy La Suite Meet on [Scalingo](https://scalingo.com/) using the [Suite Numérique buildpack](https://github.com/suitenumerique/buildpack).

## Overview

Scalingo is a Platform-as-a-Service (PaaS) that simplifies application deployment. This setup uses a custom buildpack to handle both the frontend (Vite) and backend (Django) builds, serving them through Nginx.

## Prerequisites

- A Scalingo account
- Scalingo CLI installed (optional but recommended)
- A PostgreSQL database addon
- A Redis addon (for caching and sessions)

## Step 1: Create Your App

Create a new app on Scalingo using `scalingo` cli or using the [Scalingo dashboard](https://dashboard.scalingo.com/).

## Step 2: Provision Addons

Add the required PostgreSQL and Redis services.

This will set the following environment variables automatically:
- `SCALINGO_POSTGRESQL_URL` - Database connection string
- `SCALINGO_REDIS_URL` - Redis connection string

## Step 3: Configure Environment Variables

Set the following environment variables in your Scalingo app:

### Buildpack Configuration

```bash
scalingo env-set BUILDBACK_URL="https://github.com/suitenumerique/buildpack#main"
scalingo env-set LASUITE_APP_NAME="meet"
scalingo env-set LASUITE_BACKEND_DIR="."
scalingo env-set LASUITE_FRONTEND_DIR="src/frontend/"
scalingo env-set LASUITE_NGINX_DIR="."
scalingo env-set LASUITE_SCRIPT_POSTCOMPILE="bin/buildpack_postcompile.sh"
scalingo env-set LASUITE_SCRIPT_POSTFRONTEND="bin/buildpack_postfrontend.sh"
```

### Database and Cache

```bash
scalingo env-set DATABASE_URL="\$SCALINGO_POSTGRESQL_URL"
scalingo env-set REDIS_URL="\$SCALINGO_REDIS_URL"
```

### Django Settings

```bash
scalingo env-set DJANGO_SETTINGS_MODULE="meet.settings"
scalingo env-set DJANGO_CONFIGURATION="Production"
scalingo env-set DJANGO_SECRET_KEY="<generate-a-secure-secret-key>"
scalingo env-set DJANGO_ALLOWED_HOSTS="my-meet-app.osc-fr1.scalingo.io"
```

### OIDC Authentication

Configure your OIDC provider (e.g., Keycloak, Authentik):

```bash
scalingo env-set OIDC_OP_BASE_URL="https://auth.yourdomain.com/realms/meet"
scalingo env-set OIDC_RP_CLIENT_ID="meet-client-id"
scalingo env-set OIDC_RP_CLIENT_SECRET="<your-client-secret>"
scalingo env-set OIDC_RP_SIGN_ALGO="RS256"
```

### LiveKit Configuration

Meet requires a LiveKit server for video conferencing:

```bash
scalingo env-set LIVEKIT_API_URL="wss://livekit.yourdomain.com"
scalingo env-set LIVEKIT_API_KEY="<your-livekit-api-key>"
scalingo env-set LIVEKIT_API_SECRET="<your-livekit-api-secret>"
```

### Email Configuration (Optional)

For email notifications see https://doc.scalingo.com/platform/app/sending-emails:

```bash
scalingo env-set DJANGO_EMAIL_HOST="smtp.example.org"
scalingo env-set DJANGO_EMAIL_PORT="587"
scalingo env-set DJANGO_EMAIL_HOST_USER="<smtp-user>"
scalingo env-set DJANGO_EMAIL_HOST_PASSWORD="<smtp-password>"
scalingo env-set DJANGO_EMAIL_USE_TLS="True"
scalingo env-set DJANGO_EMAIL_FROM="meet@yourdomain.com"
```

## Step 4: Deploy

Deploy your application:

```bash
git push scalingo main
```

The Procfile will automatically:
1. Build the frontend (Vite)
2. Build the backend (Django)
3. Run the post-compile script (cleanup)
4. Run the post-frontend script (move assets and prepare for deployment)
5. Start Nginx and Gunicorn
6. Run django migrations

## Step 5: Create superuser

After the first deployment, create an admin user:

```bash
scalingo run python manage.py createsuperuser
```

## Custom Domain (Optional)

To use a custom domain:

1. Add the domain in Scalingo dashboard
2. Update `DJANGO_ALLOWED_HOSTS` with your custom domain
3. Configure your DNS to point to Scalingo

```bash
scalingo domains-add meet.yourdomain.com
scalingo env-set DJANGO_ALLOWED_HOSTS="meet.yourdomain.com,my-meet-app.osc-fr1.scalingo.io"
```

## Custom Logo (Optional)

To use a custom logo, set the `CUSTOM_LOGO_URL` environment variable with an HTTPS URL pointing to an SVG item (max 5MB):

```bash
scalingo env-set CUSTOM_LOGO_URL="https://cdn.yourdomain.com/logo.svg"
```

## Troubleshooting

### Check Logs

```bash
scalingo logs --tail
```

### Common Issues

1. **Build fails**: Check that all required environment variables are set
2. **Database connection error**: Verify `DATABASE_URL` is correctly set to `$SCALINGO_POSTGRESQL_URL`
3. **Static files not served**: Ensure the buildpack post-frontend script ran successfully
4. **OIDC errors**: Verify your OIDC provider configuration and callback URLs

### Useful Commands

```bash
# Open a console
scalingo run bash

# Restart the app
scalingo restart

# Scale containers
scalingo scale web:2

# One-off command
scalingo run python manage.py shell
```

## Architecture

On Scalingo, the application runs as follows:

1. **Build Phase**: The buildpack compiles both frontend and backend
2. **Runtime**:
   - Nginx serves static files and proxies to the backend
   - Gunicorn runs the Django WSGI application
   - Both processes are managed by the `bin/buildpack_start.sh` script

## Additional Resources

- [Scalingo Documentation](https://doc.scalingo.com/)
- [Suite Numérique Buildpack](https://github.com/suitenumerique/buildpack)
- [Meet Environment Variables](../../src/helm/meet/README.md)
- [Django Configurations Documentation](https://django-configurations.readthedocs.io/)
