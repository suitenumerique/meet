"""
Test resource accesses API endpoints in the Meet core app.
"""

import random
from unittest import mock
from uuid import uuid4

import pytest
from rest_framework.pagination import PageNumberPagination
from rest_framework.test import APIClient

from ..api.serializers import ResourceAccessSerializer
from ..factories import (
    RoomFactory,
    UserFactory,
    UserResourceAccessFactory,
)
from ..models import ResourceAccess, RoleChoices, RoomAccessLevel

pytestmark = pytest.mark.django_db


def test_api_room_user_accesses_list_anonymous():
    """Anonymous users should not be allowed to list room user accesses."""

    UserResourceAccessFactory()
    client = APIClient()

    response = client.get("/api/v1.0/resource-accesses/")
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


def test_api_room_user_accesses_list_authenticated_not_related():
    """
    Authenticated users should not be allowed to list room user accesses for a room
    to which they are not related, be it public or private.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    public_room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    UserResourceAccessFactory(resource=public_room)
    UserResourceAccessFactory(resource=public_room, role="member")
    UserResourceAccessFactory(resource=public_room, role="administrator")
    UserResourceAccessFactory(resource=public_room, role="owner")

    private_room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    UserResourceAccessFactory(resource=private_room)
    UserResourceAccessFactory(resource=private_room, role="member")
    UserResourceAccessFactory(resource=private_room, role="administrator")
    UserResourceAccessFactory(resource=private_room, role="owner")

    response = client.get(
        "/api/v1.0/resource-accesses/",
    )
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_api_room_user_accesses_list_authenticated_member():
    """
    Authenticated users should not be allowed to list room user accesses for a room
    in which they are a simple member.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    public_room = RoomFactory(
        access_level=RoomAccessLevel.PUBLIC, users=[(user, "member")]
    )
    UserResourceAccessFactory(resource=public_room)
    UserResourceAccessFactory(resource=public_room, role="member")
    UserResourceAccessFactory(resource=public_room, role="administrator")
    UserResourceAccessFactory(resource=public_room, role="owner")

    private_room = RoomFactory(
        access_level=RoomAccessLevel.RESTRICTED, users=[(user, "member")]
    )
    UserResourceAccessFactory(resource=private_room)
    UserResourceAccessFactory(resource=private_room, role="member")
    UserResourceAccessFactory(resource=private_room, role="administrator")
    UserResourceAccessFactory(resource=private_room, role="owner")

    response = client.get(
        "/api/v1.0/resource-accesses/",
    )
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_api_room_user_accesses_list_authenticated_administrator():
    """
    Authenticated users should be allowed to list room user accesses for a room
    in which they are an administrator.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    public_room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    public_room_accesses = (
        # Access for the logged-in user
        UserResourceAccessFactory(
            resource=public_room, user=user, role="administrator"
        ),
        # Accesses for other users
        UserResourceAccessFactory(resource=public_room),
        UserResourceAccessFactory(resource=public_room, role="member"),
        UserResourceAccessFactory(resource=public_room, role="administrator"),
        UserResourceAccessFactory(resource=public_room, role="owner"),
    )

    private_room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    private_room_accesses = (
        # Access for the logged-in user
        UserResourceAccessFactory(
            resource=private_room, user=user, role="administrator"
        ),
        # Accesses for other users
        UserResourceAccessFactory(resource=private_room),
        UserResourceAccessFactory(resource=private_room, role="member"),
        UserResourceAccessFactory(resource=private_room, role="administrator"),
        UserResourceAccessFactory(resource=private_room, role="owner"),
    )
    response = client.get(
        "/api/v1.0/resource-accesses/",
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 10
    assert [item["id"] for item in results].sort() == [
        str(access.id) for access in public_room_accesses + private_room_accesses
    ].sort()


def test_api_room_user_accesses_list_authenticated_owner():
    """
    Authenticated users should be allowed to list room user accesses for a room
    in which they are owner.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    public_room = RoomFactory(access_level=RoomAccessLevel.PUBLIC)
    public_room_accesses = (
        # Access for the logged-in user
        UserResourceAccessFactory(resource=public_room, user=user, role="owner"),
        # Accesses for other users
        UserResourceAccessFactory(resource=public_room),
        UserResourceAccessFactory(resource=public_room, role="member"),
        UserResourceAccessFactory(resource=public_room, role="administrator"),
        UserResourceAccessFactory(resource=public_room, role="owner"),
    )
    private_room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED)
    private_room_accesses = (
        # Access for the logged-in user
        UserResourceAccessFactory(resource=private_room, user=user, role="owner"),
        # Accesses for other users
        UserResourceAccessFactory(resource=private_room),
        UserResourceAccessFactory(resource=private_room, role="member"),
        UserResourceAccessFactory(resource=private_room, role="administrator"),
        UserResourceAccessFactory(resource=private_room, role="owner"),
    )
    response = client.get("/api/v1.0/resource-accesses/")
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 10
    assert [item["id"] for item in results].sort() == [
        str(access.id) for access in public_room_accesses + private_room_accesses
    ].sort()


@mock.patch.object(PageNumberPagination, "get_page_size", return_value=2)
def test_api_room_user_accesses_list_pagination(_mock_page_size):
    """Pagination should work as expected."""

    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory()
    accesses = [
        UserResourceAccessFactory(
            resource=room, user=user, role=random.choice(["administrator", "owner"])
        ),
        *UserResourceAccessFactory.create_batch(2, resource=room),
    ]
    access_ids = [str(access.id) for access in accesses]

    response = client.get(
        "/api/v1.0/resource-accesses/",
    )
    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] == "http://testserver/api/v1.0/resource-accesses/?page=2"
    assert content["previous"] is None

    assert len(content["results"]) == 2
    for item in content["results"]:
        access_ids.remove(item["id"])

    # Get page 2
    response = client.get("/api/v1.0/resource-accesses/?page=2")

    assert response.status_code == 200
    content = response.json()

    assert content["count"] == 3
    assert content["next"] is None
    assert content["previous"] == "http://testserver/api/v1.0/resource-accesses/"
    assert len(content["results"]) == 1
    access_ids.remove(content["results"][0]["id"])
    assert access_ids == []


# Retrieve


def test_api_room_user_accesses_retrieve_anonymous():
    """
    Anonymous users should not be allowed to retrieve a room user access.
    """
    access = UserResourceAccessFactory()
    client = APIClient()

    response = client.get(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }


def test_api_room_user_accesses_retrieve_authenticated_not_related():
    """
    Authenticated users should not be allowed to retrieve a room user access for
    a room to which they are not related, be it public or private.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    for access_level in [RoomAccessLevel.PUBLIC, RoomAccessLevel.RESTRICTED]:
        room = RoomFactory(access_level=access_level)
        assert len(RoleChoices.choices) == 3

        for role, _name in RoleChoices.choices:
            access = UserResourceAccessFactory(resource=room, role=role)
            response = client.get(
                f"/api/v1.0/resource-accesses/{access.id!s}/",
            )
            assert response.status_code == 403
            assert response.json() == {
                "detail": "You do not have permission to perform this action."
            }


def test_api_room_user_accesses_retrieve_authenticated_member():
    """
    Authenticated users should not be allowed to retrieve a room user access for a room in
    which they are a simple member, be it public or private.
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    for access_level in [RoomAccessLevel.PUBLIC, RoomAccessLevel.RESTRICTED]:
        room = RoomFactory(
            access_level=access_level,
            users=[(user, "member")],
        )
        assert len(RoleChoices.choices) == 3

        for role, _name in RoleChoices.choices:
            access = UserResourceAccessFactory(resource=room, role=role)
            response = client.get(
                f"/api/v1.0/resource-accesses/{access.id!s}/",
            )
            assert response.status_code == 403
            assert response.json() == {
                "detail": "You do not have permission to perform this action."
            }


def test_api_room_user_accesses_retrieve_authenticated_administrator():
    """
    A user who is an administrator of a room should be allowed to retrieve the
    associated room user accesses
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    for access_level in [RoomAccessLevel.PUBLIC, RoomAccessLevel.RESTRICTED]:
        room = RoomFactory(access_level=access_level, users=[(user, "administrator")])
        assert len(RoleChoices.choices) == 3

        for role, _name in RoleChoices.choices:
            access = UserResourceAccessFactory(resource=room, role=role)
            response = client.get(
                f"/api/v1.0/resource-accesses/{access.id!s}/",
            )

            assert response.status_code == 200
            assert response.json() == {
                "id": str(access.id),
                "user": str(access.user.id),
                "resource": str(access.resource_id),
                "role": access.role,
            }


def test_api_room_user_accesses_retrieve_authenticated_owner():
    """
    A user who is an owner of a room should be allowed to retrieve the
    associated room user accesses
    """
    user = UserFactory()

    client = APIClient()
    client.force_login(user)

    for access_level in [RoomAccessLevel.PUBLIC, RoomAccessLevel.RESTRICTED]:
        room = RoomFactory(access_level=access_level, users=[(user, "owner")])
        assert len(RoleChoices.choices) == 3

        for role, _name in RoleChoices.choices:
            access = UserResourceAccessFactory(resource=room, role=role)
            response = client.get(
                f"/api/v1.0/resource-accesses/{access.id!s}/",
            )

            assert response.status_code == 200
            assert response.json() == {
                "id": str(access.id),
                "user": str(access.user.id),
                "resource": str(access.resource_id),
                "role": access.role,
            }


# Create


def test_api_room_user_accesses_create_anonymous():
    """Anonymous users should not be allowed to create room user accesses."""
    user = UserFactory()
    room = RoomFactory()

    client = APIClient()

    response = client.post(
        "/api/v1.0/resource-accesses/",
        {
            "user": str(user.id),
            "resource": str(room.id),
            "role": random.choice(["member", "administrator", "owner"]),
        },
    )
    assert response.status_code == 401
    assert response.json() == {
        "detail": "Authentication credentials were not provided."
    }
    assert ResourceAccess.objects.exists() is False


def test_api_room_user_accesses_create_authenticated():
    """Authenticated users should not be allowed to create room user accesses."""
    user, other_user = UserFactory.create_batch(2)
    room = RoomFactory()

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/resource-accesses/",
        {
            "user": str(other_user.id),
            "resource": str(room.id),
            "role": random.choice(["member", "administrator", "owner"]),
        },
    )
    assert response.status_code == 403
    assert response.json() == {
        "detail": "You must be administrator or owner of a room to add accesses to it."
    }
    assert ResourceAccess.objects.filter(user=other_user).exists() is False


def test_api_room_user_accesses_create_members():
    """
    A user who is a simple member in a room should not be allowed to create
    room user accesses in this room.
    """
    user, other_user = UserFactory.create_batch(2)
    room = RoomFactory(users=[(user, "member")])

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/resource-accesses/",
        {
            "user": str(other_user.id),
            "resource": str(room.id),
            "role": random.choice(["member", "administrator", "owner"]),
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "You must be administrator or owner of a room to add accesses to it."
    }
    assert ResourceAccess.objects.filter(user=other_user).exists() is False


def test_api_room_user_accesses_create_administrators_except_owner():
    """
    A user who is administrator in a room should be allowed to create
    room user accesses in this room for roles other than owner (which is tested in the
    subsequent test).
    """
    user, other_user = UserFactory.create_batch(2)
    room = RoomFactory(users=[(user, "administrator")])

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/resource-accesses/",
        {
            "user": str(other_user.id),
            "resource": str(room.id),
            "role": random.choice(["member", "administrator"]),
        },
    )
    assert response.status_code == 201
    assert ResourceAccess.objects.count() == 2
    assert ResourceAccess.objects.filter(user=other_user).exists() is True


def test_api_room_user_accesses_create_administrators_owner():
    """
    A user who is administrator in a room should not be allowed to create room
    user accesses in this room for the owner role.
    """
    user, other_user = UserFactory.create_batch(2)
    room = RoomFactory(users=[(user, "administrator")])

    client = APIClient()
    client.force_login(user)

    response = client.post(
        "/api/v1.0/resource-accesses/",
        {
            "user": str(other_user.id),
            "resource": str(room.id),
            "role": "owner",
        },
    )
    assert response.status_code == 403
    assert ResourceAccess.objects.filter(user=other_user).exists() is False


def test_api_room_user_accesses_create_owner_all_roles():
    """
    A user who is owner in a room should be allowed to create
    room user accesses in this room for all roles.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])

    client = APIClient()
    client.force_login(user)

    for i, role in enumerate(["member", "administrator", "owner"]):
        other_user = UserFactory()
        response = client.post(
            "/api/v1.0/resource-accesses/",
            {
                "user": str(other_user.id),
                "resource": str(room.id),
                "role": role,
            },
        )

        assert response.status_code == 201
        assert ResourceAccess.objects.count() == i + 2
        assert ResourceAccess.objects.filter(user=other_user).exists() is True


# Update


def test_api_room_user_accesses_update_anonymous():
    """Anonymous users should not be allowed to update a room user access."""
    access = UserResourceAccessFactory()
    old_values = ResourceAccessSerializer(instance=access).data

    client = APIClient()

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory().id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code == 401
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_authenticated():
    """Authenticated users should not be allowed to update a room user access."""
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    access = UserResourceAccessFactory()
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "member")]).id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code == 403
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_member():
    """
    A user who is a simple member in a room should not be allowed to update
    a user access for this room.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "member")])
    access = UserResourceAccessFactory(resource=room)
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "member")]).id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code == 403
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_administrator_except_owner():
    """
    A user who is an administrator in a room should be allowed to update
    a user access for this room, as long as she does not try to set the role to owner.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "administrator")])
    access = UserResourceAccessFactory(
        resource=room, role=random.choice(["member", "administrator"])
    )
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "administrator")]).id,
        "user": UserFactory().id,
        "role": random.choice(["member", "administrator"]),
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code, 200
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        if field == "role":
            assert updated_values == {**old_values, "role": new_values["role"]}
        else:
            assert updated_values == old_values


def test_api_room_user_accesses_update_administrator_from_owner():
    """
    A user who is an administrator in a room, should not be allowed to update
    the user access of an owner for this room.
    """
    user, other_user = UserFactory.create_batch(2)
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "administrator")])
    access = UserResourceAccessFactory(resource=room, user=other_user, role="owner")
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "administrator")]).id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code == 403
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_administrator_to_owner():
    """
    A user who is an administrator in a room should not be allowed to update
    the user access of another user when granting ownership.
    """
    user, other_user = UserFactory.create_batch(2)
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "administrator")])
    access = UserResourceAccessFactory(
        resource=room,
        user=other_user,
        role=random.choice(["member", "administrator"]),
    )
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "administrator")]).id,
        "user": UserFactory().id,
        "role": "owner",
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        if field == "role":
            assert response.status_code == 403
        else:
            assert response.status_code == 200
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_owner_except_owner():
    """
    A user who is an owner in a room should be allowed to update
    a user access for this room except for existing owner accesses.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "owner")])
    access = UserResourceAccessFactory(
        resource=room, role=random.choice(["member", "administrator"])
    )
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "administrator")]).id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }

    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )

        assert response.status_code == 200
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data

        if field == "role":
            assert updated_values == {**old_values, "role": new_values["role"]}
        else:
            assert updated_values == old_values


def test_api_room_user_accesses_update_owner_for_owners():
    """
    A user who is an owner in a room should not be allowed to update
    an existing owner user access for this room.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory(users=[(user, "owner")])
    access = UserResourceAccessFactory(resource=room, role="owner")
    old_values = ResourceAccessSerializer(instance=access).data

    new_values = {
        "id": uuid4(),
        "resource": RoomFactory(users=[(user, "administrator")]).id,
        "user": UserFactory().id,
        "role": random.choice(RoleChoices.choices)[0],
    }
    for field, value in new_values.items():
        response = client.put(
            f"/api/v1.0/resource-accesses/{access.id!s}/",
            {**old_values, field: value},
            format="json",
        )
        assert response.status_code == 403
        access.refresh_from_db()
        updated_values = ResourceAccessSerializer(instance=access).data
        assert updated_values == old_values


def test_api_room_user_accesses_update_owner_self():
    """
    A user who is an owner in a room should be allowed to update
    her own user access provided there are other owners in the room.
    """
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    room = RoomFactory()
    access = UserResourceAccessFactory(resource=room, user=user, role="owner")
    old_values = ResourceAccessSerializer(instance=access).data
    new_role = random.choice(["member", "administrator"])

    response = client.put(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
        {**old_values, "role": new_role},
        format="json",
    )

    assert response.status_code == 403
    access.refresh_from_db()
    assert access.role == "owner"

    # Add another owner and it should now work
    UserResourceAccessFactory(resource=room, role="owner")

    response = client.put(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
        {**old_values, "role": new_role},
        format="json",
    )

    assert response.status_code == 200
    access.refresh_from_db()
    assert access.role == new_role


# Delete


def test_api_room_user_access_delete_anonymous():
    """Anonymous users should not be allowed to destroy a room user access."""
    access = UserResourceAccessFactory()
    client = APIClient()

    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 401
    assert ResourceAccess.objects.count() == 1


def test_api_room_user_access_delete_authenticated():
    """
    Authenticated users should not be allowed to delete a room user access for a room in
    which they are not administrator.
    """
    access = UserResourceAccessFactory()
    user = UserFactory()
    client = APIClient()
    client.force_login(user)

    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 403
    assert ResourceAccess.objects.count() == 1


def test_api_room_user_access_delete_members():
    """
    Authenticated users should not be allowed to delete a room user access for a room in
    which they are a simple member.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "member")])
    access = UserResourceAccessFactory(resource=room)

    client = APIClient()
    client.force_login(user)

    assert ResourceAccess.objects.count() == 2
    assert ResourceAccess.objects.filter(user=access.user).exists() is True
    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 403
    assert ResourceAccess.objects.count() == 2


def test_api_room_user_access_delete_administrators():
    """
    Users who are administrators in a room should be allowed to delete a user access
    from the room provided it is not ownership.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "administrator")])
    access = UserResourceAccessFactory(
        resource=room, role=random.choice(["member", "administrator"])
    )

    client = APIClient()
    client.force_login(user)

    assert ResourceAccess.objects.count() == 2
    assert ResourceAccess.objects.filter(user=access.user).exists() is True
    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 204
    assert ResourceAccess.objects.count() == 1


def test_api_room_user_access_delete_owners_except_owners():
    """
    Users should be able to delete the room user access of another user
    for a room in which they are owner except for owners.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    access = UserResourceAccessFactory(
        resource=room, role=random.choice(["member", "administrator"])
    )

    client = APIClient()
    client.force_login(user)

    assert ResourceAccess.objects.count() == 2
    assert ResourceAccess.objects.filter(user=access.user).exists() is True
    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 204
    assert ResourceAccess.objects.count() == 1


def test_api_room_user_access_delete_owners_for_owners():
    """
    Users should not be able to delete the room user access of another owner
    even for a room in which they are owners.
    """
    user = UserFactory()
    room = RoomFactory(users=[(user, "owner")])
    access = UserResourceAccessFactory(resource=room, role="owner")

    client = APIClient()
    client.force_login(user)

    assert ResourceAccess.objects.count() == 2
    assert ResourceAccess.objects.filter(user=access.user).exists() is True
    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 403
    assert ResourceAccess.objects.count() == 2


def test_api_room_user_access_delete_owners_last_owner():
    """
    It should not be possible to delete the last owner access from a room
    """
    user = UserFactory()
    room = RoomFactory()
    access = UserResourceAccessFactory(resource=room, user=user, role="owner")

    client = APIClient()
    client.force_login(user)

    assert ResourceAccess.objects.count() == 1
    response = client.delete(
        f"/api/v1.0/resource-accesses/{access.id!s}/",
    )

    assert response.status_code == 403
    assert ResourceAccess.objects.count() == 1
