"""Invitation Service."""

import smtplib
from logging import getLogger

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.translation import get_language, override
from django.utils.translation import gettext_lazy as _

logger = getLogger(__name__)


class InvitationError(Exception):
    """Exception raised when invitation emails cannot be sent."""

    status_code = 500


class InvitationService:
    """Service for invitations to users."""

    @staticmethod
    def invite_to_room(room, sender, emails):
        """Send invitation emails to join a room."""

        language = get_language()

        context = {
            "brandname": settings.EMAIL_BRAND_NAME,
            "logo_img": settings.EMAIL_LOGO_IMG,
            "domain": settings.EMAIL_DOMAIN,
            "room_url": f"{settings.EMAIL_APP_BASE_URL}/{room.slug}",
            "room_link": f"{settings.EMAIL_DOMAIN}/{room.slug}",
            "sender_email": sender.email,
        }

        with override(language):
            msg_html = render_to_string("mail/html/invitation.html", context)
            msg_plain = render_to_string("mail/text/invitation.txt", context)
            subject = str(
                _(
                    f"Video call in progress: {sender.email} is waiting for you to connect"
                )
            )  # Force translation

            email = EmailMultiAlternatives(
                subject=subject,
                body=msg_plain,
                from_email=settings.EMAIL_FROM,
                to=[],
                bcc=emails,
            )

            email.attach_alternative(msg_html, "text/html")

            try:
                email.send()
            except smtplib.SMTPException as e:
                logger.error("invitation to %s was not sent: %s", emails, e)
                raise InvitationError("Could not send invitation") from e
