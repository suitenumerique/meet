"""Tests for the audit of DRF views through ``AuditViewMixin``."""

# pylint: disable=missing-function-docstring,unused-argument

from unittest import mock

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied

import pytest
from rest_framework import (
    decorators,
    exceptions,
    mixins,
    permissions,
    routers,
    viewsets,
)
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from core import audit, models
from core.audit.testing import find_events
from core.authentication.backends import SessionAuthenticationWith401
from core.factories import RoomFactory

pytestmark = pytest.mark.django_db


class ThingViewSet(audit.AuditViewMixin, viewsets.ViewSet):
    """A viewset auditing ``list`` and ``create`` but not ``destroy``."""

    authentication_classes = [SessionAuthenticationWith401]
    permission_classes = []
    audit_actions = {"list": "thing.list", "create": "thing.create"}
    error = None

    def list(self, request):
        if self.error is not None:
            raise self.error
        self.audit_details = {"total": 3}
        return Response([])

    def create(self, request):
        return Response({"error": "Already exists."}, status=409)

    def destroy(self, request, pk=None):
        return Response(status=204)


class RoomViewSet(
    audit.AuditViewMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """A viewset whose target comes from ``get_object``."""

    authentication_classes = []
    permission_classes = []
    queryset = models.Room.objects.all()
    audit_actions = {"retrieve": "room.retrieve"}

    def get_serializer(self, *args, **kwargs):
        return type("Serializer", (), {"data": {}})()


GRANT = audit.Action(
    "thing.grant",
    category=audit.EventCategory.IAM,
    types=(audit.EventType.CREATION,),
)


class GrantViewSet(audit.AuditViewMixin, viewsets.ViewSet):
    """A viewset whose extra action declares its audit on the route."""

    authentication_classes = [SessionAuthenticationWith401]
    permission_classes = []
    error = None

    @decorators.action(detail=False, methods=["post"], audit_action=GRANT)
    def grant(self, request):
        if self.error is not None:
            raise self.error
        return Response({})

    @decorators.action(detail=False, methods=["post"])
    def ping(self, request):
        return Response({})


class ListingViewSet(ThingViewSet):
    """A ``ThingViewSet`` keeping the details it was built with."""

    def list(self, request):
        return Response([])


class DenyObjects(permissions.BasePermission):
    """Refuse every object, whatever the request."""

    def has_object_permission(self, request, view, obj):
        return False


def test_success_is_audited_with_the_view_details(audit_events):
    """A successful action is recorded with its type and the view's details."""
    view = ThingViewSet.as_view({"get": "list"})

    response = view(APIRequestFactory().get("/things/", REMOTE_ADDR="1.2.3.4"))

    assert response.status_code == 200

    [event] = find_events(audit_events, "thing.list")

    assert event["event"]["category"] == ["api"]
    assert event["event"]["type"] == ["access"]
    assert event["event"]["outcome"] == "success"
    assert event["lasuite"]["details"] == {"total": 3}
    assert event["client"] == {"ip": "1.2.3.4"}
    assert event["url"] == {"path": "/things/"}
    assert event["http"] == {"request": {"method": "GET"}}


def test_missing_credentials_are_audited_as_authentication_denial(audit_events):
    """A 401 is a denial in the authentication category."""
    view = ThingViewSet.as_view({"get": "list"}, error=exceptions.NotAuthenticated())

    response = view(APIRequestFactory().get("/things/"))

    assert response.status_code == 401

    [event] = find_events(audit_events, "thing.list")

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["access", "denied"]
    assert event["event"]["reason"] == "authentication_failed"
    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["actor"] == {"type": "anonymous"}
    assert event["http"]["response"] == {"status_code": 401}
    assert event["error"]["message"] == "Authentication credentials were not provided."
    assert event["log"]["level"] == "warning"
    assert "details" not in event["lasuite"]


@pytest.mark.parametrize(
    "error,status_code,outcome,reason",
    [
        (
            exceptions.AuthenticationFailed("bad"),
            401,
            "denied",
            "authentication_failed",
        ),
        (exceptions.PermissionDenied("scope"), 403, "denied", "permission_denied"),
        (DjangoPermissionDenied("nope"), 403, "denied", "permission_denied"),
        (exceptions.Throttled(wait=10), 429, "denied", "rate_limited"),
        (
            exceptions.ValidationError({"name": ["x"]}),
            400,
            "failure",
            "validation_error",
        ),
        (exceptions.NotFound(), 404, "failure", "not_found"),
        (exceptions.MethodNotAllowed("PUT"), 405, "failure", None),
    ],
)
def test_errors_are_audited_from_the_status_code(
    audit_events, error, status_code, outcome, reason
):
    """The outcome and the reason are derived from the response status."""
    view = ThingViewSet.as_view({"get": "list"}, error=error)

    response = view(APIRequestFactory().get("/things/"))

    assert response.status_code == status_code

    [event] = find_events(audit_events, "thing.list")

    assert event["lasuite"]["outcome"] == outcome
    assert event["event"].get("reason") == reason
    assert event["http"]["response"] == {"status_code": status_code}


def test_error_message_of_a_view_response(audit_events):
    """An error response built by the view reports its ``error`` message."""
    view = ThingViewSet.as_view({"post": "create"})

    response = view(APIRequestFactory().post("/things/"))

    assert response.status_code == 409

    [event] = find_events(audit_events, "thing.create")

    assert event["event"]["type"] == ["creation"]
    assert event["event"]["reason"] == "conflict"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["error"] == {"message": "Already exists."}


def test_actions_missing_from_the_map_are_not_audited(audit_events):
    """Only the actions listed in ``audit_actions`` emit events."""
    view = ThingViewSet.as_view({"delete": "destroy"})

    response = view(APIRequestFactory().delete("/things/1/"), pk="1")

    assert response.status_code == 204
    assert audit_events == []


def test_unhandled_exception_is_audited_as_internal_error(audit_events):
    """An exception DRF does not handle is recorded, by class only, then raised."""
    view = ThingViewSet.as_view(
        {"get": "list"}, error=RuntimeError("user@example.com is broken")
    )

    with pytest.raises(RuntimeError):
        view(APIRequestFactory().get("/things/"))

    [event] = find_events(audit_events, "thing.list")

    assert event["event"]["type"] == ["access"]
    assert event["event"]["reason"] == "internal_error"
    assert event["lasuite"]["outcome"] == "failure"
    assert event["http"]["response"] == {"status_code": 500}
    assert event["error"] == {"type": "builtins.RuntimeError"}
    assert event["log"]["level"] == "error"
    assert "user@example.com" not in str(event)


def test_object_permission_denial_keeps_the_target(audit_events):
    """A refusal on a detail route names the object that was refused."""
    room = RoomFactory()
    view = RoomViewSet.as_view({"get": "retrieve"}, permission_classes=[DenyObjects])

    response = view(APIRequestFactory().get(f"/rooms/{room.pk}/"), pk=str(room.pk))

    assert response.status_code == 403

    [event] = find_events(audit_events, "room.retrieve")

    assert event["lasuite"]["outcome"] == "denied"
    assert event["lasuite"]["target"]["id"] == str(room.pk)


def test_object_of_a_detail_route_is_the_target(audit_events):
    """The object of a detail route becomes the target of the event."""
    room = RoomFactory()
    view = RoomViewSet.as_view({"get": "retrieve"})

    response = view(APIRequestFactory().get(f"/rooms/{room.pk}/"), pk=str(room.pk))

    assert response.status_code == 200

    [event] = find_events(audit_events, "room.retrieve")

    assert event["lasuite"]["target"]["id"] == str(room.pk)
    assert event["lasuite"]["target"]["type"] == "room"


def test_extra_actions_cannot_be_mapped_by_method_name():
    """Renaming a method must not silently stop auditing it."""
    with pytest.raises(TypeError, match="grant"):

        class MappedViewSet(audit.AuditViewMixin, viewsets.ViewSet):  # pylint: disable=unused-variable
            """Maps an extra action in ``audit_actions``."""

            audit_actions = {"list": "thing.list", "grant": "thing.grant"}


def test_extra_action_is_audited_from_its_route(audit_events):
    """The ``audit_action`` of a routed ``@action`` names the event."""
    router = routers.SimpleRouter()
    router.register("things", GrantViewSet, basename="thing")
    [route] = [url for url in router.urls if url.name == "thing-grant"]

    response = route.callback(APIRequestFactory().post("/things/grant/"))

    assert response.status_code == 200

    [event] = find_events(audit_events, GRANT)

    assert event["event"]["category"] == ["iam"]
    assert event["event"]["type"] == ["creation"]


def test_extra_action_is_audited_without_a_router(audit_events):
    """A view built by hand reads ``audit_action`` from its handler."""
    view = GrantViewSet.as_view({"post": "grant"})

    response = view(APIRequestFactory().post("/things/grant/"))

    assert response.status_code == 200
    assert len(find_events(audit_events, GRANT)) == 1


def test_extra_action_without_audit_action_is_not_audited(audit_events):
    """An ``@action`` that does not name an audit action emits nothing."""
    view = GrantViewSet.as_view({"post": "ping"})

    response = view(APIRequestFactory().post("/things/ping/"))

    assert response.status_code == 200
    assert audit_events == []


def test_unauthenticated_extra_action_is_an_authentication_denial(audit_events):
    """A 401 still files the event under ``authentication``, whatever the spec."""
    view = GrantViewSet.as_view({"post": "grant"}, error=exceptions.NotAuthenticated())

    response = view(APIRequestFactory().post("/things/grant/"))

    assert response.status_code == 401

    [event] = find_events(audit_events, GRANT)

    assert event["event"]["category"] == ["authentication"]
    assert event["event"]["type"] == ["creation", "denied"]


@pytest.mark.parametrize("method", ["options", "get"])
def test_requests_reaching_no_extra_action_are_not_audited(audit_events, method):
    """An OPTIONS request, or a method the route refuses, audits nothing.

    The router hands the route's ``audit_action`` to every view it builds, the
    ones answering those requests included.
    """
    router = routers.SimpleRouter()
    router.register("things", GrantViewSet, basename="thing")
    [route] = [url for url in router.urls if url.name == "thing-grant"]

    response = route.callback(getattr(APIRequestFactory(), method)("/things/grant/"))

    assert response.status_code == (200 if method == "options" else 405)
    assert audit_events == []


def test_details_never_override_event_fields(audit_events):
    """A detail named after an event field is dropped, never raising."""
    view = ListingViewSet.as_view(
        {"get": "list"},
        audit_details={"request": None, "outcome": "failure", "total": 3},
    )

    response = view(APIRequestFactory().get("/things/"))

    assert response.status_code == 200

    [event] = find_events(audit_events, "thing.list")

    assert event["event"]["outcome"] == "success"
    assert event["url"] == {"path": "/things/"}
    assert event["lasuite"]["details"] == {"total": 3}


def test_failing_audit_never_fails_the_response(audit_events):
    """An error assembling the event is logged, and the response is kept."""
    view = ThingViewSet.as_view({"get": "list"})

    with mock.patch.object(
        ThingViewSet, "get_audit_fields", side_effect=RuntimeError("boom")
    ):
        response = view(APIRequestFactory().get("/things/"))

    assert response.status_code == 200
    assert audit_events == []
