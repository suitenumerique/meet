"""Generic tasks to send transactional emails."""

import logging
import smtplib

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.translation import get_language, gettext, override

from core.tasks._task import task

logger = logging.getLogger(__name__)


def get_base_email_context() -> dict:
    """Context shared by every email template (branding, support, domain)."""
    return {
        "brandname": settings.EMAIL_BRAND_NAME,
        "support_email": settings.EMAIL_SUPPORT_EMAIL,
        "logo_img": settings.EMAIL_LOGO_IMG,
        "domain": settings.EMAIL_DOMAIN,
    }


@task(
    autoretry_for=(smtplib.SMTPException, ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def send_email(
    *,
    template: str,
    subject: str,
    recipients: list[str],
    context: dict | None = None,
    language: str | None = None,
):
    """Render a mail template and send it.

    Generic on purpose: any feature can reuse it with its own template and context.

    Args:
        template: Template base name, e.g. "screen_recording". Both
            "mail/html/<template>.html" and "mail/text/<template>.txt" must exist.
        subject: Untranslated subject msgid. Mark it with ``gettext_noop`` at the
            call site; it is translated here, in ``language``.
        recipients: Email addresses, all receiving the same rendered message.
        context: Template context. Must be JSON-serializable (str, int, list, dict…):
            pre-format dates, cast UUIDs to str. Merged over the base branding context.
        language: Language to render the email in. Defaults to the active language.

    Raises:
        smtplib.SMTPException: after retries are exhausted (or immediately when
            Celery is disabled and the call runs synchronously).
    """
    full_context = {**get_base_email_context(), **(context or {})}

    with override(language or get_language()):
        msg_html = render_to_string(f"mail/html/{template}.html", full_context)
        msg_plain = render_to_string(f"mail/text/{template}.txt", full_context)
        translated_subject = gettext(subject)

    send_mail(
        translated_subject,
        msg_plain,
        settings.EMAIL_FROM,
        recipients,
        html_message=msg_html,
        fail_silently=False,
    )
    logger.info("Email '%s' sent to %d recipient(s)", template, len(recipients))
