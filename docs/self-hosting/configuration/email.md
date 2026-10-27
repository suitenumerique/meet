# Email (SMTP)

Meet sends email for two things only. Sign-in goes through your OIDC provider and sends none.

- **Room invitations**, sent through the API (`POST /api/v1.0/rooms/<id>/invite/`); the interface has no button for them. Without SMTP, the request fails.
- **A screen recording's download link**, emailed to whoever started the recording and to the room's owners and administrators. Without SMTP, the recording is still saved.

To reach a recording whose email never left:

- Find its ID in the Django admin, under `/admin/` → **Core → Recordings**. The people the email was meant for can then open `https://meet.example.com/recording/<id>`.
- Once SMTP works, the admin action **Resend notification to external service** sends the email again.

## What to set

| Variable | Example |
|---|---|
| `DJANGO_EMAIL_HOST` | `smtp.example.com` |
| `DJANGO_EMAIL_PORT` | `587` |
| `DJANGO_EMAIL_HOST_USER` | `meet@example.com` |
| `DJANGO_EMAIL_HOST_PASSWORD` | your SMTP password |
| `DJANGO_EMAIL_USE_TLS` | `True` on port 587 (STARTTLS); use `DJANGO_EMAIL_USE_SSL=True` instead on port 465 |
| `DJANGO_EMAIL_FROM` | `meet@example.com` |
| `DJANGO_EMAIL_APP_BASE_URL` | `https://meet.example.com`, used to build the invitation link. The recording link comes from [`RECORDING_DOWNLOAD_BASE_URL`](../../reference/env-variables.md#recording) |
| `DJANGO_EMAIL_DOMAIN` | `meet.example.com` |

The branding variables (`DJANGO_EMAIL_BRAND_NAME`, `DJANGO_EMAIL_LOGO_IMG`, `DJANGO_EMAIL_SUPPORT_EMAIL`), the SMTP timeout `DJANGO_EMAIL_TIMEOUT`, and every default are in [Environment Variables: Email](../../reference/env-variables.md#email).

With [`CELERY_ENABLED`](../../reference/env-variables.md#redis-celery-and-presence)`=True`, the Celery worker sends the recording emails and retries a failed delivery, so a slow SMTP server never holds up the backend. Otherwise the backend sends them itself.

## Docker Compose setup

Set the variables in `env.d/common`, which already holds a commented-out Mail block. Do not set them in `.env`: Compose reads `env.d/common` after it, so a value set in both comes from `env.d/common`. Then recreate the backend and the Celery worker:

```bash
docker compose up -d --force-recreate backend celery
```

## Kubernetes setup

Set them under `backend.envVars` in your `values.yaml`, the password from a Secret rather than in plain text:

```yaml
backend:
  envVars:
    DJANGO_EMAIL_HOST: "smtp.example.com"
    DJANGO_EMAIL_PORT: "587"
    DJANGO_EMAIL_HOST_USER: "meet@example.com"
    DJANGO_EMAIL_HOST_PASSWORD:
      secretKeyRef:
        name: meet-secrets
        key: smtp-password
    DJANGO_EMAIL_USE_TLS: "True"
    DJANGO_EMAIL_FROM: "meet@example.com"
    DJANGO_EMAIL_APP_BASE_URL: "https://meet.example.com"
    DJANGO_EMAIL_DOMAIN: "meet.example.com"
```

Then apply them with `helm upgrade meet meet/meet --namespace meet --values values.yaml`.

## Scalingo setup

Set each variable with `scalingo env-set NAME="value"`. [Scalingo's email documentation](https://doc.scalingo.com/platform/app/sending-emails) covers its SMTP providers.

## Check delivery

Send a test email from the backend, with your own address:

```bash
docker compose exec backend python manage.py shell -c "from django.conf import settings; from django.core.mail import send_mail; send_mail('Meet test', 'It works.', settings.EMAIL_FROM, ['you@example.com'])"
```

Meet's own failures appear in the backend log as `could not be sent` for recording links, or `were not sent` for invitations:

```bash
docker compose logs backend | grep -E "could not be sent|were not sent"
```

With `CELERY_ENABLED=True`, a recording email that fails in the worker appears in the worker's log instead, where Celery reports the retries:

```bash
docker compose logs celery | grep -i -E "send_email|retry"
```
