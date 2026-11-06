"""Unit tests for the LiveKit token authentication."""

import pytest
from livekit.api.access_token import Claims
from rest_framework.test import APIRequestFactory

from core.authentication.livekit import LiveKitTokenAuthentication
from core.factories import UserFactory
from core.utils import generate_token

pytestmark = pytest.mark.django_db


def test_authenticate_token_from_another_cluster(two_livekit_clusters):
    """A token signed by any registered LiveKit cluster authenticates its user.

    The request's auth stays the token's claims, which carry that cluster.
    """
    _paris, lyon = two_livekit_clusters
    user = UserFactory()
    token = generate_token(room="my-room", user=user, cluster=lyon)
    request = APIRequestFactory().post(
        "/", HTTP_AUTHORIZATION=f"X-LiveKit-Token {token}"
    )

    authenticated_user, claims = LiveKitTokenAuthentication().authenticate(request)

    assert authenticated_user == user
    assert isinstance(claims, Claims)
    assert claims.identity == str(user.sub)
    assert claims.video.room == "my-room"
    assert claims.cluster == lyon
