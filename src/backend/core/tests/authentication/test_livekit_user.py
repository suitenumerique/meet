"""
Tests of the user LiveKitTokenAuthentication resolves (MatrixRTC clients).
"""

from django.conf import settings

import pytest
from livekit.api import AccessToken, VideoGrants
from rest_framework.test import APIRequestFactory

from core.authentication.livekit import LiveKitTokenAuthentication
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


def livekit_token(identity, attributes=None):
    """A LiveKit token of the test configuration."""
    token = (
        AccessToken(
            api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
            api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .with_grants(VideoGrants(room="room", room_join=True))
        .with_identity(identity)
    )
    if attributes:
        token = token.with_attributes(attributes)
    return token.to_jwt()


def authenticate(token):
    """The (user, claims) the authentication gives for the token."""
    request = APIRequestFactory().post(
        "/", HTTP_AUTHORIZATION=f"Bearer {token}", format="json"
    )
    return LiveKitTokenAuthentication().authenticate(request)


def test_user_by_sub_as_before():
    """A token whose identity is the sub of a user: that user."""
    alice = UserFactory(sub="alice-sub")

    user, _ = authenticate(livekit_token("alice-sub"))

    assert user == alice


def test_user_by_the_user_id_attribute_first():
    """An imposed identity (`user:device`) names nobody: the `user_id`
    attribute does, even for a user without a sub."""
    alice = UserFactory(sub=None)

    user, _ = authenticate(
        livekit_token("@alice:localhost:DEVICE", {"user_id": str(alice.pk)})
    )

    assert user == alice


def test_anonymous_when_nothing_matches():
    """An unknown identity and no usable attribute: anonymous."""
    user, _ = authenticate(
        livekit_token("@nobody:localhost:DEVICE", {"user_id": "not-a-uuid"})
    )

    assert user.is_anonymous
