# Email (SMTP)

Meet uses SMTP to send transactional emails. Without it configured, two features are affected:

- **Room email invitations** - sent through the API (`POST /api/v1.0/rooms/<id>/invite/`); the interface has no button for them.
- **Recording download notifications** - recording itself is unaffected, but the person who started it is not emailed a link when it finishes. The recording is still saved and its download link remains available in the Django admin panel. See [Recording](recording.md).

Meet does not use email for authentication (OIDC/SSO handles that) or for password resets, so SMTP is needed only for those two features.

---

## Docker Compose setup

Add to your `.env`:

```dotenv
DJANGO_EMAIL_HOST=smtp.example.com
DJANGO_EMAIL_PORT=587
DJANGO_EMAIL_HOST_USER=meet@example.com
DJANGO_EMAIL_HOST_PASSWORD=<password>
DJANGO_EMAIL_USE_TLS=True
DJANGO_EMAIL_FROM=meet@example.com
DJANGO_EMAIL_APP_BASE_URL=https://meet.example.com
DJANGO_EMAIL_DOMAIN=meet.example.com
```

!!!info
    `DJANGO_EMAIL_USE_TLS` and `DJANGO_EMAIL_USE_SSL` are mutually exclusive - use `DJANGO_EMAIL_USE_TLS=True` for STARTTLS on port 587 (the common case), or `DJANGO_EMAIL_USE_SSL=True` for implicit TLS on port 465. Leave both `False` only for an unencrypted internal relay.

Optionally, brand the email templates:

```dotenv
DJANGO_EMAIL_BRAND_NAME=My Organization
DJANGO_EMAIL_LOGO_IMG=https://meet.example.com/assets/logo-suite-numerique.png
DJANGO_EMAIL_SUPPORT_EMAIL=support@example.com
```

Restart the backend:

```bash
docker compose up -d --force-recreate backend
```

---

## Kubernetes setup

Add to `backend.envVars` in your `values.yaml`:

```yaml
backend:
  envVars:
    DJANGO_EMAIL_HOST: "smtp.example.com"
    DJANGO_EMAIL_PORT: "587"
    DJANGO_EMAIL_HOST_USER: "meet@example.com"
    DJANGO_EMAIL_HOST_PASSWORD: "smtp-password"
    DJANGO_EMAIL_USE_TLS: "True"
    DJANGO_EMAIL_FROM: "meet@example.com"
    DJANGO_EMAIL_APP_BASE_URL: "https://meet.example.com"
    DJANGO_EMAIL_DOMAIN: "meet.example.com"
```

Apply the updated chart:

```bash
helm upgrade meet meet/meet --namespace meet --values values.yaml
```

---

## Scalingo setup

```bash
scalingo env-set DJANGO_EMAIL_HOST="smtp.example.org"
scalingo env-set DJANGO_EMAIL_PORT="587"
scalingo env-set DJANGO_EMAIL_HOST_USER="<smtp-user>"
scalingo env-set DJANGO_EMAIL_HOST_PASSWORD="<smtp-password>"
scalingo env-set DJANGO_EMAIL_USE_TLS="True"
scalingo env-set DJANGO_EMAIL_FROM="meet@yourdomain.com"
scalingo env-set DJANGO_EMAIL_APP_BASE_URL="https://meet.yourdomain.com"
scalingo env-set DJANGO_EMAIL_DOMAIN="meet.yourdomain.com"
```

See [Scalingo's email documentation](https://doc.scalingo.com/platform/app/sending-emails) for provider-specific setup.

---

## Verifying delivery

Trigger a recording download notification, then check backend logs for SMTP errors:

```bash
docker compose logs backend | grep -i smtp
```

If `DJANGO_EMAIL_HOST` is not configured, recording download links remain available in the Django admin panel at `/admin/ → Core → Recordings` - see [Recording](recording.md). Room email invitations have no such fallback: without SMTP, sending an invitation fails outright.

---

## Full configuration reference

Every email variable, with its default: [Environment Variables: Email](../../reference/env-variables.md#email).
