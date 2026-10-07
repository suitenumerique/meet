"""Tests for the network fields and the request id of audit events."""

import uuid

from django.http import HttpResponse
from django.test import RequestFactory

import pytest
from dockerflow.logging import request_id_context
from faker import Faker

from core.api.throttling import CreationCallbackAnonRateThrottle
from core.audit import request as audit_request

fake = Faker()


def _set_num_proxies(settings, count):
    """Trust ``count`` proxies, as DRF's ``NUM_PROXIES`` setting."""
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": count}


@pytest.fixture(name="dockerflow_request_id")
def fixture_dockerflow_request_id():
    """Simulate the dockerflow middleware having assigned a request id."""
    request_id = fake.uuid4()
    token = request_id_context.set(request_id)
    try:
        yield request_id
    finally:
        request_id_context.reset(token)


def test_resolve_client_ip_without_forwarded_header():
    """Should use the peer address when no proxy header is present."""
    peer_ip = fake.ipv4()
    request = RequestFactory().get("/", REMOTE_ADDR=peer_ip)

    assert audit_request.resolve_client_ip(request) == peer_ip


def test_resolve_client_ip_prefers_the_client_over_the_proxy():
    """Should return the client the trusted proxy saw, not the proxy address."""
    request = RequestFactory().get(
        "/", REMOTE_ADDR="1.2.3.4", HTTP_X_FORWARDED_FOR="4.5.6.7, 10.0.0.1"
    )

    assert audit_request.resolve_client_ip(request) == "10.0.0.1"


def test_resolve_client_ip_skips_trusted_proxies(settings):
    """Should skip the load balancer entry when two proxies are trusted."""
    _set_num_proxies(settings, 2)
    request = RequestFactory().get(
        "/", HTTP_X_FORWARDED_FOR="1.1.1.1, 2.2.2.2, 8.8.8.8"
    )

    assert audit_request.resolve_client_ip(request) == "2.2.2.2"


def test_resolve_client_ip_clamps_when_fewer_addresses_than_proxies(settings):
    """Should never index out of range on a short chain."""
    _set_num_proxies(settings, 5)
    request = RequestFactory().get("/", HTTP_X_FORWARDED_FOR="1.2.3.4")

    assert audit_request.resolve_client_ip(request) == "1.2.3.4"


def test_resolve_client_ip_ignores_an_empty_forwarded_header():
    """Should fall back to the peer address when the header is blank."""
    peer_ip = fake.ipv4()
    request = RequestFactory().get("/", REMOTE_ADDR=peer_ip, HTTP_X_FORWARDED_FOR=" , ")

    assert audit_request.resolve_client_ip(request) == peer_ip


def test_resolve_client_ip_without_trusted_proxy(settings):
    """Should ignore the header entirely when no proxy is trusted."""
    _set_num_proxies(settings, 0)
    request = RequestFactory().get(
        "/", REMOTE_ADDR="1.2.3.4", HTTP_X_FORWARDED_FOR="4.5.6.7"
    )

    assert audit_request.resolve_client_ip(request) == "1.2.3.4"


def test_resolve_client_ip_is_the_throttle_identity(settings):
    """Should identify the client exactly as Meet's throttles do."""
    _set_num_proxies(settings, 2)
    request = RequestFactory().get(
        "/", REMOTE_ADDR="1.2.3.4", HTTP_X_FORWARDED_FOR="6.6.6.6, 5.6.7.8, 10.0.0.1"
    )

    assert audit_request.resolve_client_ip(request) == "5.6.7.8"
    assert CreationCallbackAnonRateThrottle().get_ident(request) == "5.6.7.8"


def test_resolve_client_ip_tolerates_bare_requests():
    """Should accept requests built by hand, which have an empty META."""
    request = RequestFactory().get("/")
    request.META = {}

    assert audit_request.resolve_client_ip(request) is None


def test_current_request_id_is_dockerflow_request_id(dockerflow_request_id):
    """Should reuse the dockerflow request id as the trace id."""
    assert audit_request.current_request_id() == dockerflow_request_id


def test_current_request_id_outside_a_request():
    """Should have no id when dockerflow did not assign one."""
    assert audit_request.current_request_id() is None


def test_middleware_replaces_an_untrusted_request_id(dockerflow_request_id):
    """Should not reuse an inbound id unless the ingress is trusted to set it."""
    middleware = audit_request.AuditLogMiddleware(lambda request: HttpResponse())

    response = middleware(RequestFactory().get("/"))

    request_id = response["X-Request-ID"]

    assert request_id != dockerflow_request_id
    assert str(uuid.UUID(request_id)) == request_id
    assert audit_request.current_request_id() == request_id


def test_middleware_echoes_a_trusted_request_id(settings, dockerflow_request_id):
    """Should keep and echo the inbound id when the ingress is trusted."""
    settings.REQUEST_ID_TRUST_HEADER = True
    middleware = audit_request.AuditLogMiddleware(lambda request: HttpResponse())

    response = middleware(RequestFactory().get("/"))

    assert response["X-Request-ID"] == dockerflow_request_id


def test_middleware_echoes_on_the_configured_header(settings, dockerflow_request_id):
    """Should echo the id on the header dockerflow reads it from."""
    settings.REQUEST_ID_TRUST_HEADER = True
    settings.DOCKERFLOW_REQUEST_ID_HEADER_NAME = "X-Trace-ID"
    middleware = audit_request.AuditLogMiddleware(lambda request: HttpResponse())

    response = middleware(RequestFactory().get("/"))

    assert response["X-Trace-ID"] == dockerflow_request_id
    assert not response.has_header("X-Request-ID")


@pytest.mark.usefixtures("dockerflow_request_id")
def test_middleware_keeps_an_existing_response_header():
    """Should leave an X-Request-ID set by the view untouched."""

    def view(request):  # pylint: disable=unused-argument
        response = HttpResponse()
        response["X-Request-ID"] = "from-the-view"
        return response

    response = audit_request.AuditLogMiddleware(view)(RequestFactory().get("/"))

    assert response["X-Request-ID"] == "from-the-view"


@pytest.mark.django_db
def test_request_id_from_the_client_is_replaced_by_default(client):
    """Should answer with an id of its own, not the one the client sent."""
    response = client.get("/api/v1.0/config/", HTTP_X_REQUEST_ID="abc-123")

    assert response.status_code == 200
    assert response["X-Request-ID"] != "abc-123"
    assert uuid.UUID(response["X-Request-ID"])


@pytest.mark.django_db
def test_request_id_flows_through_the_test_client_when_trusted(client, settings):
    """Should echo the id dockerflow read when the ingress is trusted."""
    settings.REQUEST_ID_TRUST_HEADER = True

    response = client.get("/api/v1.0/config/", HTTP_X_REQUEST_ID="abc-123")

    assert response.status_code == 200
    assert response["X-Request-ID"] == "abc-123"


@pytest.mark.django_db
def test_request_id_is_echoed_on_responses_of_outer_middleware(client):
    """Should reach responses that never get to the view, as slash redirects."""
    response = client.get("/api/v1.0/config")

    assert response.status_code == 301
    assert uuid.UUID(response["X-Request-ID"])


def test_current_request_outside_a_request():
    """Should have no current request when none is being served."""
    assert audit_request.current_request() is None


def test_middleware_sets_the_current_request_while_serving():
    """Should expose the request to the code serving it, then forget it."""
    seen = []

    def view(request):  # pylint: disable=unused-argument
        seen.append(audit_request.current_request())
        return HttpResponse()

    request = RequestFactory().get("/")
    audit_request.AuditLogMiddleware(view)(request)

    assert seen == [request]
    assert audit_request.current_request() is None


def test_middleware_forgets_the_current_request_when_the_view_raises():
    """Should not leak the request to the next one when the view raises."""

    def view(request):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        audit_request.AuditLogMiddleware(view)(RequestFactory().get("/"))

    assert audit_request.current_request() is None
