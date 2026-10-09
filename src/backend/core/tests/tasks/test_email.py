"""Tests for the generic send_email task."""

# pylint: disable=unused-argument,redefined-outer-name

import smtplib
from unittest import mock

from django.utils.translation import gettext_noop

import pytest

from core.tasks.email import send_email


@pytest.fixture
def email_settings(settings):
    """Branding settings shared by every email."""
    settings.EMAIL_BRAND_NAME = "ACME"
    settings.EMAIL_SUPPORT_EMAIL = "support@acme.com"
    settings.EMAIL_LOGO_IMG = "https://acme.com/logo"
    settings.EMAIL_DOMAIN = "acme.com"
    settings.EMAIL_FROM = "notifications@acme.com"
    return settings


@mock.patch("core.tasks.email.send_mail")
@mock.patch("core.tasks.email.render_to_string", side_effect=["<p>html</p>", "text"])
def test_send_email_renders_template_and_sends(
    mock_render, mock_send_mail, email_settings
):
    """Both template variants are rendered with base + caller context, then sent."""
    send_email(
        template="some_template",
        subject="Any subject",
        recipients=["a@test.com", "b@test.com"],
        context={"foo": "bar", "brandname": "Overridden"},
    )

    expected_context = {
        "brandname": "Overridden",
        "support_email": "support@acme.com",
        "logo_img": "https://acme.com/logo",
        "domain": "acme.com",
        "foo": "bar",
    }
    assert mock_render.call_args_list == [
        mock.call("mail/html/some_template.html", expected_context),
        mock.call("mail/text/some_template.txt", expected_context),
    ]
    mock_send_mail.assert_called_once_with(
        "Any subject",
        "text",
        "notifications@acme.com",
        ["a@test.com", "b@test.com"],
        html_message="<p>html</p>",
        fail_silently=False,
    )


@mock.patch("core.tasks.email.send_mail")
def test_send_email_translates_subject_in_requested_language(
    mock_send_mail, email_settings
):
    """The subject msgid is translated in the worker, in the recipient language."""
    send_email(
        template="screen_recording",
        subject=gettext_noop("Your recording is ready"),
        recipients=["franc@test.com"],
        context={"room_name": "Room", "link": "https://acme.com/r/1"},
        language="fr-fr",
    )

    subject, body, *_ = mock_send_mail.call_args[0]
    assert subject == "Votre enregistrement est prêt"
    assert "Votre enregistrement est prêt !" in body


@mock.patch(
    "core.tasks.email.send_mail", side_effect=smtplib.SMTPException("SMTP Error")
)
@mock.patch("core.tasks.email.render_to_string", return_value="content")
def test_send_email_raises_on_smtp_error(mock_render, mock_send_mail, email_settings):
    """SMTP errors propagate so Celery can retry the task."""
    with pytest.raises(smtplib.SMTPException):
        send_email(
            template="some_template",
            subject="Any subject",
            recipients=["a@test.com"],
        )
