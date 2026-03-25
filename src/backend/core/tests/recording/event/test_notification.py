"""
Test event notification.
"""

# pylint: disable=assignment-from-no-return,redefined-outer-name,unused-argument,protected-access

import datetime
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


@mock.patch.object(NotificationService, "_notify_summary_service", return_value=True)
@mock.patch.object(NotificationService, "_notify_user_by_email", return_value=True)
def test_notify_external_services_screen_recording_mode_with_transcribe(
    mock_notify_email, mock_notify_summary
):
    """Test notification routing for screen recording mode with transcribe option."""

    service = NotificationService()

    recording = factories.RecordingFactory(
        mode=models.RecordingModeChoices.SCREEN_RECORDING, options={"transcribe": True}
    )

    result = service.notify_external_services(recording)

    assert result is True
    mock_notify_email.assert_called_once_with(recording)
    mock_notify_summary.assert_called_once_with(recording)


def test_notify_external_services_unknown_mode(caplog):
    """Test notification for unknown recording mode."""
    recording = factories.RecordingFactory()

    # Bypass validation
    recording.mode = "unknown"

    service = NotificationService()

    result = service.notify_external_services(recording)

    assert result is False
    assert f"Unknown recording mode unknown for recording {recording.id}" in caplog.text


# pylint: disable=too-many-locals
def test_notify_user_by_email_success(mocked_current_site, settings):
    """Test successful email notification to recording owners."""
    settings.EMAIL_BRAND_NAME = "ACME"
    settings.EMAIL_SUPPORT_EMAIL = "support@acme.com"
    settings.EMAIL_LOGO_IMG = "https://acme.com/logo"
    settings.SCREEN_RECORDING_BASE_URL = "https://acme.com/recordings"
    settings.RECORDING_DOWNLOAD_BASE_URL = None
    settings.EMAIL_FROM = "notifications@acme.com"

    recording = factories.RecordingFactory(room__name="Conference Room A")

    # Fix recording test to avoid flaky tests
    recording.created_at = datetime.datetime(2023, 5, 15, 14, 30, 0)

    french_user = factories.UserFactory(
        email="franc@test.com", language="fr-fr", timezone="Europe/Paris"
    )
    dutch_user = factories.UserFactory(
        email="berry@test.com", language="nl-nl", timezone="Europe/Amsterdam"
    )
    english_user = factories.UserFactory(
        email="john@test.com", language="en-us", timezone="America/Phoenix"
    )

    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER, user=french_user
    )
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER, user=dutch_user
    )
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER, user=english_user
    )

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
        assert mock_send_mail.call_count == 3

        call_args_list = mock_send_mail.call_args_list

        base_content = [
            "ACME",  # Brand name
            "support@acme.com",  # Support email
            "https://acme.com/logo",  # Logo URL
            f"https://acme.com/recordings/{recording.id}",  # Recording link
            "Conference Room A",  # Room name
        ]

        # First call verification
        subject1, body1, sender1, recipients1 = call_args_list[0][0]
        assert subject1 == "Votre enregistrement est prêt"

        # Verify email contains expected content
        personalized_content1 = [
            *base_content,
            "2023-05-15",  # Formatted date
            "16:30",  # Formatted time
            "Votre enregistrement est prêt !",  # Intro
        ]
        for content in personalized_content1:
            assert content in body1

        assert recipients1 == ["franc@test.com"]
        assert sender1 == "notifications@acme.com"

        # Second call verification
        subject2, body2, sender2, recipients2 = call_args_list[1][0]
        assert subject2 == "Je opname is klaar"

        # Verify second email content (if needed)
        personalized_content2 = [
            *base_content,
            "2023-05-15",  # Formatted date
            "16:30",  # Formatted time
            "Je opname is klaar!",  # Intro
        ]
        for content in personalized_content2:
            assert content in body2

        assert recipients2 == ["berry@test.com"]
        assert sender2 == "notifications@acme.com"

        # Third call verification
        subject3, body3, sender3, recipients3 = call_args_list[2][0]
        assert subject3 == "Your recording is ready"

        # Verify second email content (if needed)
        personalized_content3 = [
            *base_content,
            "Conference Room A",  # Room name
            "2023-05-15",  # Formatted date
            "07:30",  # Formatted time
            "Your recording is ready!",  # Intro
        ]
        for content in personalized_content3:
            assert content in body3

        assert recipients3 == ["john@test.com"]
        assert sender3 == "notifications@acme.com"


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
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER
    )
    factories.UserRecordingAccessFactory(
        recording=recording, role=models.RoleChoices.OWNER
    )

    notification_service = NotificationService()

    with mock.patch(
        "core.recording.event.notification.send_mail",
        side_effect=smtplib.SMTPException("SMTP Error"),
    ) as mock_send_mail:
        result = notification_service._notify_user_by_email(recording)

        assert result is False
        assert mock_send_mail.call_count == 2
        assert "notification could not be sent:" in caplog.text
