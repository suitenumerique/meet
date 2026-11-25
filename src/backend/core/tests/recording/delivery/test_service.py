"""Tests for choosing, then carrying out, how a recording is delivered."""

# pylint: disable=redefined-outer-name,unused-argument

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock

import pytest
from celery.exceptions import OperationalError as CeleryOperationalError

from core import factories, models
from core.audit.testing import find_events
from core.recording.delivery import service
from core.recording.delivery.credentials import Credential, CredentialError

pytestmark = pytest.mark.django_db

Status = models.RecordingDeliveryStatusChoices


@pytest.fixture
def drive_settings(settings, encryption_key):
    """Push recordings to Drive with a token exchanged with Menshen."""
    settings.RECORDING_STORAGE_METHOD = "drive"
    settings.RECORDING_DRIVE_AUTH_METHOD = "token_exchange"


def make_request(user):
    """Return a request of the user, whose session is empty."""
    return SimpleNamespace(user=user, session={})


def test_prepare_transcript_is_not_delivered(drive_settings):
    """An audio-only transcript ends up in Docs: it gets no delivery."""
    recording = factories.RecordingFactory(mode="transcript")

    assert service.prepare(make_request(factories.UserFactory()), recording) is None
    assert not models.RecordingDelivery.objects.exists()


def test_prepare_s3_email(settings):
    """By default, a video recording is delivered by email, needing no token."""
    settings.RECORDING_STORAGE_METHOD = "s3_email"
    user = factories.UserFactory()
    recording = factories.RecordingFactory(mode="screen_recording")

    delivery = service.prepare(make_request(user), recording)

    delivery.refresh_from_db()
    assert delivery.recording == recording
    assert delivery.user == user
    assert delivery.method == "s3_email"
    assert delivery.status == Status.PENDING
    assert delivery.token is None
    assert delivery.token_type is None


def test_prepare_drive_token_exchange(drive_settings):
    """The exchanged token is kept, encrypted, with its expiration."""
    expires_at = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)
    recording = factories.RecordingFactory(mode="screen_recording")

    with mock.patch(
        "core.recording.delivery.service.get_from_session",
        return_value=Credential("exchanged-token", expires_at),
    ) as get_from_session:
        delivery = service.prepare(make_request(factories.UserFactory()), recording)

    get_from_session.assert_called_once()
    delivery.refresh_from_db()
    assert delivery.method == "drive"
    assert delivery.status == Status.PENDING
    assert delivery.token_type == "token_exchange"
    assert delivery.token and "exchanged-token" not in delivery.token
    assert delivery.get_token() == "exchanged-token"
    assert delivery.token_expires_at == expires_at


def test_prepare_drive_without_token_falls_back(drive_settings, settings, audit_events):
    """Without a token, the recording will be delivered by email."""
    settings.RECORDING_DRIVE_EMAIL_FALLBACK_ENABLED = True
    recording = factories.RecordingFactory(mode="screen_recording")

    delivery = service.prepare(make_request(factories.UserFactory()), recording)

    delivery.refresh_from_db()
    assert delivery.method == "s3_email"
    assert delivery.status == Status.PENDING
    assert "No token" in delivery.error
    assert delivery.token is None
    assert delivery.token_type is None

    [event] = find_events(audit_events, "recording.drive.push")
    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["details"]["delivery_method"] == "s3_email"


def test_prepare_drive_without_token_no_fallback(
    drive_settings, settings, audit_events
):
    """Without a token, nor falling back, the recording will not be delivered."""
    settings.RECORDING_DRIVE_EMAIL_FALLBACK_ENABLED = False
    recording = factories.RecordingFactory(mode="screen_recording")

    delivery = service.prepare(make_request(factories.UserFactory()), recording)

    delivery.refresh_from_db()
    assert delivery.method == "drive"
    assert delivery.status == Status.FAILED
    assert "No token" in delivery.error
    assert delivery.token is None
    assert delivery.token_type == "token_exchange"

    [event] = find_events(audit_events, "recording.drive.push")
    assert event["lasuite"]["outcome"] == "failure"
    assert event["event"]["reason"] == "authentication_failed"
    assert event["entity"]["target"]["id"] == str(recording.id)
    assert event["lasuite"]["details"]["delivery_method"] == "drive"


def test_prepare_drive_unusable_token(drive_settings, settings):
    """The reason why the token of the session cannot be used is kept."""
    settings.RECORDING_DRIVE_EMAIL_FALLBACK_ENABLED = False
    recording = factories.RecordingFactory(mode="screen_recording")

    with mock.patch(
        "core.recording.delivery.service.get_from_session",
        side_effect=CredentialError("The token of the session has expired."),
    ):
        delivery = service.prepare(make_request(factories.UserFactory()), recording)

    assert delivery.status == Status.FAILED
    assert delivery.error == "The token of the session has expired."


def test_get_method_without_delivery():
    """A recording started before deliveries existed is delivered by email."""
    recording = factories.RecordingFactory(mode="screen_recording")

    assert service.get_method(recording) == "s3_email"


def test_get_method_with_delivery():
    """The method is the one chosen when the recording started."""
    delivery = factories.RecordingDeliveryFactory(method="drive")

    assert service.get_method(delivery.recording) == "drive"


@mock.patch("core.recording.delivery.service.push_recording_to_drive")
def test_dispatch_to_drive_pending(mock_task, encryption_key):
    """A pending delivery is handed over to a worker, once."""
    delivery = factories.RecordingDeliveryFactory()

    assert service.dispatch_to_drive(delivery.recording) is True

    mock_task.delay.assert_called_once_with(str(delivery.recording_id))
    delivery.refresh_from_db()
    assert delivery.status == Status.PUSHING


@mock.patch("core.recording.delivery.service.push_recording_to_drive")
def test_dispatch_to_drive_failed(mock_task):
    """A delivery that failed, e.g. for want of a token, is not pushed."""
    delivery = factories.RecordingDeliveryFactory(status=Status.FAILED)

    assert service.dispatch_to_drive(delivery.recording) is False

    mock_task.delay.assert_not_called()


@pytest.mark.parametrize("status", [Status.PUSHING, Status.UPLOADED, Status.DELIVERED])
@mock.patch("core.recording.delivery.service.push_recording_to_drive")
def test_dispatch_to_drive_never_twice(mock_task, status):
    """A delivery already pushed, or being pushed, is not pushed again."""
    delivery = factories.RecordingDeliveryFactory(status=status)

    assert service.dispatch_to_drive(delivery.recording) is True

    mock_task.delay.assert_not_called()
    delivery.refresh_from_db()
    assert delivery.status == status


@mock.patch("core.recording.delivery.service.push_recording_to_drive")
def test_dispatch_to_drive_broker_unavailable(mock_task, encryption_key):
    """When the push cannot be queued, the delivery stays pending with its token."""
    mock_task.delay.side_effect = CeleryOperationalError("broker down")
    delivery = factories.RecordingDeliveryFactory()
    delivery.set_token("exchanged-token", None)
    delivery.save()

    assert service.dispatch_to_drive(delivery.recording) is False

    delivery.refresh_from_db()
    assert delivery.status == Status.PENDING
    assert delivery.get_token() == "exchanged-token"


def test_abandon_drops_the_token(encryption_key):
    """A recording that will never be saved drops its token, others may share it."""
    delivery = factories.RecordingDeliveryFactory()
    delivery.set_token("exchanged-token", None)
    delivery.save()

    service.abandon(delivery.recording, "The recording failed.")

    delivery.refresh_from_db()
    assert delivery.status == Status.FAILED
    assert delivery.error == "The recording failed."
    assert delivery.token is None


def test_abandon_without_delivery():
    """A recording without delivery has nothing to abandon."""
    recording = factories.RecordingFactory(mode="transcript")

    service.abandon(recording, "The recording failed.")

    assert not models.RecordingDelivery.objects.exists()


@pytest.mark.parametrize("status", [Status.PUSHING, Status.DELIVERED, Status.FAILED])
def test_abandon_only_pending(status):
    """Only a delivery still waiting for its recording is abandoned."""
    delivery = factories.RecordingDeliveryFactory(status=status)

    service.abandon(delivery.recording, "The recording failed.")

    delivery.refresh_from_db()
    assert delivery.status == status
    assert delivery.error == ""
