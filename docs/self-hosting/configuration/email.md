# Email (SMTP)

Meet sends email for two things only. Sign-in goes through your [OIDC](https://openid.net/developers/how-connect-works/) provider and sends none.

- **Room invitations**, sent through the API's `POST /api/v1.0/rooms/<id>/invite/`; the interface has no button for them. Without SMTP, the request fails.
- **A screen recording's download link**, emailed to whoever started the recording and to the room's owners and co-hosts. Without SMTP, the recording is still saved.

To reach a recording whose email never left:

- Find its ID in the Django admin, under `/admin/` → **Core → Recordings**. The people the email was meant for can then open `https://meet.example.com/recording/<id>`.
- Once SMTP works, the admin action **Resend notification to external service** sends the email again.

## What to set

Set your SMTP server's host, port, login and sender address with the variables of [Environment Variables: Email](../../reference/env-variables.md#email). On port 587, set `DJANGO_EMAIL_USE_TLS=True` for STARTTLS; on port 465, `DJANGO_EMAIL_USE_SSL=True` instead.

- `DJANGO_EMAIL_APP_BASE_URL`, such as `https://meet.example.com`, builds the invitation link.
- `DJANGO_EMAIL_DOMAIN`, such as `meet.example.com`, is the domain every email shows.
- The recording link comes from [`RECORDING_DOWNLOAD_BASE_URL`](../../reference/env-variables.md#RECORDING_DOWNLOAD_BASE_URL) instead.

With [`CELERY_ENABLED`](../../reference/env-variables.md#CELERY_ENABLED)`=True`, the Celery worker sends the recording emails and retries a failed delivery, so a slow SMTP server never holds up the backend. Otherwise the backend sends them itself.

## Docker Compose setup

Set the variables in `env.d/common`, which already holds a commented-out Mail block, not in `.env`: Compose reads `env.d/common` last, so its value wins. Then recreate the backend and the Celery worker:

```bash
docker compose up -d --force-recreate backend celery
```

## Kubernetes setup

Put the SMTP password in a Secret, so it stays out of `values.yaml`:

```bash
kubectl -n meet create secret generic meet-smtp \
  --from-literal=password="<your SMTP password>"
```

Then set the variables under `backend.envVars` in your `values.yaml`:

```yaml
backend:
  envVars:
    DJANGO_EMAIL_HOST: "smtp.example.com"
    DJANGO_EMAIL_PORT: "587"
    DJANGO_EMAIL_HOST_USER: "meet@example.com"
    DJANGO_EMAIL_HOST_PASSWORD:
      secretKeyRef:
        name: meet-smtp
        key: password
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
docker compose exec -T backend python manage.py shell <<'EOF'
from django.conf import settings
from django.core.mail import send_mail
send_mail("Meet test", "It works.", settings.EMAIL_FROM, ["you@example.com"])
EOF
```

Then look for Meet's own failures:

```bash
# "could not be sent" is a recording link, "were not sent" an invitation
docker compose logs backend | grep -E "could not be sent|were not sent"
# With CELERY_ENABLED=True, a recording email fails in the worker, with its retries
docker compose logs celery | grep -i -E "send_email|retry"
```
