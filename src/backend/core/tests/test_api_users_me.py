# pylint: disable=missing-module-docstring,missing-function-docstring,redefined-outer-name
import pytest
from rest_framework.test import APIClient

from core import factories

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def test_users_me_requires_authentication(api_client):
    response = api_client.get("/api/v1.0/users/me/")

    assert response.status_code == 401


def test_users_me_returns_user_when_authenticated(api_client):
    user = factories.UserFactory(email="john@test.com")

    api_client.force_authenticate(user=user)
    response = api_client.get("/api/v1.0/users/me/")

    assert response.status_code == 200
    data = response.json()

    assert data["email"] == "john@test.com"
