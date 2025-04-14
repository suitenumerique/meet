"""
Test event notification.
"""

# pylint: disable=E1128,W0621,W0613,W0212

import smtplib
from unittest import mock

from django.contrib.sites.models import Site

import pytest

from core import factories, models
from core.recording.event.notification import NotificationService, notification_service

pytestmark = pytest.mark.django_db


@pytest.fixture
def mocked_current_site():
    """Mocks the Site.objects.get_current()to return a controlled predefined domain."""

    site_mock = mock.Mock()
    site_mock.domain = "test-domain.com"

    with mock.patch.object(
        Site.objects, "get_current", return_value=site_mock
    ) as patched:
        yield patched


@mock.patch.object(NotificationService, "_notify_summary_service", return_value=True)
def test_notify_external_services_transcript_mode(mock_notify_summary):
    """Test notification routing for transcript mode recordings."""

    service = NotificationService()

    recording = factories.RecordingFactory(mode=models.RecordingModeChoices.TRANSCRIPT)
    result = service.notify_external_services(recording)

    assert result is True
    mock_notify_summary.assert_called_once_with(recording)


@mock.patch.object(NotificationService, "_notify_user_by_email", return_value=True)
def test_notify_external_services_screen_recording_mode(mock_notify_email):
    """Test notification routing for screen recording mode."""

    service = NotificationService()

    recording = factories.RecordingFactory(
        mode=models.RecordingModeChoices.SCREEN_RECORDING
    )

    result = service.notify_external_services(recording)

    assert result is True
    mock_notify_email.assert_called_once_with(recording)


def test_notify_external_services_unknown_mode(caplog):
    """Test notification for unknown recording mode."""
    recording = factories.RecordingFactory()

    # Bypass validation
    recording.mode = "unknown"

    service = NotificationService()

    result = service.notify_external_services(recording)

    assert result is False
    assert f"Unknown recording mode unknown for recording {recording.id}" in caplog.text


def test_notify_user_by_email_success(mocked_current_site, settings):
    """Test successful email notification to recording owners."""
    settings.EMAIL_BRAND_NAME = "ACME"
    settings.EMAIL_SUPPORT_EMAIL = "support@acme.com"
    settings.EMAIL_LOGO_IMG = "https://acme.com/logo"
    settings.SCREEN_RECORDING_BASE_URL = "https://acme.com/recordings"
    settings.EMAIL_FROM = "notifications@acme.com"

    recording = factories.RecordingFactory(room__name="Conference Room A")

    owners = [
        factories.UserRecordingAccessFactory(
            recording=recording, role=models.RoleChoices.OWNER
        ).user,
        factories.UserRecordingAccessFactory(
            recording=recording, role=models.RoleChoices.OWNER
        ).user,
    ]
    owner_emails = [owner.email for owner in owners]

    # Create non-owner users to verify they don't receive emails
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.MEMBER
    )
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.ADMIN
    )

    notification_service = NotificationService()

    with mock.patch("core.recording.event.notification.send_mail") as mock_send_mail:
        result = notification_service._notify_user_by_email(recording)

        assert result is True
        mock_send_mail.assert_called_once()

        subject, body, sender, recipients = mock_send_mail.call_args[0]

        assert subject == "Your recording is ready"

        # Verify email contains expected content
        required_content = [
            "ACME",  # Brand name
            "support@acme.com",  # Support email
            "https://acme.com/logo",  # Logo URL
            f"https://acme.com/recordings/{recording.id}",  # Recording link
            "Conference Room A",  # Room name
            recording.created_at.strftime("%A %d %B %Y"),  # Formatted date
            recording.created_at.strftime("%H:%M"),  # Formatted time
        ]

        for content in required_content:
            assert content in body

        assert sender == "notifications@acme.com"

        # Verify all owners received the email (order-independent comparison)
        assert sorted(recipients) == sorted(owner_emails)


def test_notify_user_by_email_no_owners(mocked_current_site, caplog):
    """Test email notification when no owners are found."""

    # Recording with no access
    recording = factories.RecordingFactory()

    result = notification_service._notify_user_by_email(recording)

    assert result is False
    assert f"No owner found for recording {recording.id}" in caplog.text


def test_notify_user_by_email_smtp_exception(mocked_current_site, caplog):
    """Test email notification when an exception occurs."""

    recording = factories.RecordingFactory(room__name="Conference Room A")
    owner = factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER
    ).user

    notification_service = NotificationService()

    with mock.patch(
        "core.recording.event.notification.send_mail",
        side_effect=smtplib.SMTPException("SMTP Error"),
    ) as mock_send_mail:
        result = notification_service._notify_user_by_email(recording)

        assert result is False
        mock_send_mail.assert_called_once()
        assert f"notification to ['{owner.email}'] was not sent" in caplog.text
