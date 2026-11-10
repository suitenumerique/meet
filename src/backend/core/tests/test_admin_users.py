"""Tests for the user admin class."""

import pytest

from core import factories

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def static_storage_without_manifest(settings):
    """Render the admin pages without collecting the static files first."""
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }


def _admin_client(client):
    """Log a superuser in the client."""
    client.force_login(factories.UserFactory(is_staff=True, is_superuser=True))
    return client


def test_admin_users_duplicate_email_filter(client):
    """The filter should keep the users sharing their stored email, grouped by email
    and ordered by creation, but not the users whose email only matches through
    Unicode case folding."""
    first_jim = factories.UserFactory(email="jim@example.com")
    first_ann = factories.UserFactory(email="ann@example.com")
    second_jim = factories.UserFactory(email="JIM@example.com")
    second_ann = factories.UserFactory(email="ann@example.com")
    factories.UserFactory(email="jım@example.com")
    factories.UserFactory(email="bob@example.com")
    factories.UserFactory(email=None)
    factories.UserFactory(email=None)

    response = _admin_client(client).get("/admin/core/user/?duplicate_email=yes")

    assert response.status_code == 200
    assert [user.pk for user in response.context["cl"].result_list] == [
        first_ann.pk,
        second_ann.pk,
        first_jim.pk,
        second_jim.pk,
    ]


def test_admin_users_last_login(client):
    """The last login of users should be shown in the list and on the change page."""
    user = factories.UserFactory()
    admin_client = _admin_client(client)

    changelist = admin_client.get("/admin/core/user/")
    change = admin_client.get(f"/admin/core/user/{user.pk}/change/")

    assert changelist.status_code == 200
    assert "column-last_login" in changelist.content.decode()
    assert change.status_code == 200
    assert "field-last_login" in change.content.decode()
