"""
Tests for JWT token service.
"""

# pylint: disable=W0212,W0621

import uuid
from unittest import mock

from django.core.exceptions import ImproperlyConfigured

import jwt as pyjwt
import pytest
from freezegun import freeze_time

from core.services.jwt_token import (
    JwtTokenService,
    TokenDecodeError,
    TokenExpiredError,
    TokenInvalidError,
)

# -- Fixtures --


@pytest.fixture
def jwt_service():
    """Create a JWT token service for testing."""
    return JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="test-issuer",
        audience="test-audience",
        expiration_seconds=3600,
        token_type="Bearer",
    )


@pytest.fixture
def mock_user():
    """Create a mock user with a string ID."""
    user = mock.Mock()
    user.id = "test-user-id"
    return user


# -- __init__ / Configuration --


def test_init_missing_secret_key():
    """Missing secret key should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Secret key is required"):
        JwtTokenService(
            secret_key="",
            algorithm="HS256",
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type="Bearer",
        )


def test_init_none_secret_key():
    """None secret key should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Secret key is required"):
        JwtTokenService(
            secret_key=None,
            algorithm="HS256",
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type="Bearer",
        )


def test_init_missing_algorithm():
    """Missing algorithm should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Algorithm is required"):
        JwtTokenService(
            secret_key="test-secret-padded-to-32-bytes!!",
            algorithm="",
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type="Bearer",
        )


def test_init_none_algorithm():
    """None algorithm should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Algorithm is required"):
        JwtTokenService(
            secret_key="test-secret-padded-to-32-bytes!!",
            algorithm=None,
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type="Bearer",
        )


def test_init_missing_token_type():
    """Missing token type should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Token's type is required"):
        JwtTokenService(
            secret_key="test-secret-padded-to-32-bytes!!",
            algorithm="HS256",
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type="",
        )


def test_init_none_token_type():
    """None token type should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Token's type is required"):
        JwtTokenService(
            secret_key="test-secret-padded-to-32-bytes!!",
            algorithm="HS256",
            issuer="issuer",
            audience="audience",
            expiration_seconds=3600,
            token_type=None,
        )


def test_init_none_expiration_seconds():
    """None expiration seconds should raise ImproperlyConfigured."""
    with pytest.raises(ImproperlyConfigured, match="Expiration's seconds is required"):
        JwtTokenService(
            secret_key="test-secret-padded-to-32-bytes!!",
            algorithm="HS256",
            issuer="issuer",
            audience="audience",
            expiration_seconds=None,
            token_type="Bearer",
        )


def test_init_zero_expiration_seconds_is_accepted():
    """expiration_seconds=0 is falsy but should be accepted — token expires immediately."""
    service = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer",
        audience="audience",
        expiration_seconds=0,
        token_type="Bearer",
    )
    assert service._expiration_seconds == 0


def test_init_stores_config_correctly():
    """All config values should be stored correctly on the instance."""
    service = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="my-issuer",
        audience="my-audience",
        expiration_seconds=1800,
        token_type="Bearer",
    )
    assert service._key == "test-secret-padded-to-32-bytes!!"
    assert service._algorithm == "HS256"
    assert service._issuer == "my-issuer"
    assert service._audience == "my-audience"
    assert service._expiration_seconds == 1800
    assert service._token_type == "Bearer"


# -- generate_jwt / Return shape --


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_always_returns_required_keys(jwt_service, mock_user):
    """Response always contains access_token, token_type, and expires_in."""
    result = jwt_service.generate_jwt(mock_user, scope="read")

    assert "access_token" in result
    assert "token_type" in result
    assert "expires_in" in result
    assert result["token_type"] == "Bearer"
    assert result["expires_in"] == 3600
    assert isinstance(result["access_token"], str)


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_scope_present_when_provided(jwt_service, mock_user):
    """scope key should be present in response when scope is provided."""
    result = jwt_service.generate_jwt(mock_user, scope="read write")

    assert result["scope"] == "read write"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_scope_absent_when_empty(jwt_service, mock_user):
    """scope key should be absent from response when scope is empty."""
    result = jwt_service.generate_jwt(mock_user, scope="")

    assert "scope" not in result


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_scope_absent_when_none(jwt_service, mock_user):
    """scope key should be absent from response when scope is None."""
    result = jwt_service.generate_jwt(mock_user, scope=None)

    assert "scope" not in result


# -- generate_jwt / Payload correctness --


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_payload_contains_required_claims(jwt_service, mock_user):
    """Payload should always contain iat, exp, and user_id."""
    result = jwt_service.generate_jwt(mock_user, scope="read")
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["iat"] == 1673784000
    assert payload["exp"] == 1673787600
    assert payload["user_id"] == "test-user-id"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_exp_is_now_plus_expiration_seconds(mock_user):
    """exp should equal iat + expiration_seconds exactly."""
    service = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer",
        audience="audience",
        expiration_seconds=900,
        token_type="Bearer",
    )
    result = service.generate_jwt(mock_user, scope="read")
    payload = service.decode_jwt(result["access_token"])

    assert payload["exp"] - payload["iat"] == 900


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_iss_included_when_set(jwt_service, mock_user):
    """iss should be present in payload when issuer is non-empty."""
    result = jwt_service.generate_jwt(mock_user, scope="read")
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["iss"] == "test-issuer"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_aud_included_when_set(jwt_service, mock_user):
    """aud should be present in payload when audience is non-empty."""
    result = jwt_service.generate_jwt(mock_user, scope="read")
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["aud"] == "test-audience"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_iss_absent_when_empty(mock_user):
    """iss should be absent from payload when issuer is empty string."""

    service = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="",
        audience="",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    result = service.generate_jwt(mock_user, scope="read")
    payload = pyjwt.decode(
        result["access_token"],
        "test-secret-padded-to-32-bytes!!",
        algorithms=["HS256"],
        options={"verify_aud": False},
    )

    assert "iss" not in payload
    assert "aud" not in payload


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_iss_absent_when_none(mock_user):
    """iss should be absent from payload when issuer is None."""

    service = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer=None,
        audience=None,
        expiration_seconds=3600,
        token_type="Bearer",
    )
    result = service.generate_jwt(mock_user, scope="read")
    payload = pyjwt.decode(
        result["access_token"],
        "test-secret-padded-to-32-bytes!!",
        algorithms=["HS256"],
        options={"verify_aud": False},
    )

    assert "iss" not in payload
    assert "aud" not in payload


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_scope_absent_from_payload_when_empty(jwt_service, mock_user):
    """scope should be absent from payload when not provided."""

    result = jwt_service.generate_jwt(mock_user, scope="")
    payload = pyjwt.decode(
        result["access_token"],
        "test-secret-padded-to-32-bytes!!",
        algorithms=["HS256"],
        issuer="test-issuer",
        audience="test-audience",
    )

    assert "scope" not in payload


# -- generate_jwt / extra_payload handling --


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_none_does_not_crash(jwt_service, mock_user):
    """extra_payload=None should not crash and produce a valid token."""
    result = jwt_service.generate_jwt(mock_user, scope="read", extra_payload=None)
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["user_id"] == "test-user-id"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_non_colliding_keys_preserved(
    jwt_service, mock_user
):
    """Non-colliding extra_payload keys should appear in decoded token."""
    result = jwt_service.generate_jwt(
        mock_user,
        scope="read",
        extra_payload={"client_id": "my-app", "delegated": True},
    )
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["client_id"] == "my-app"
    assert payload["delegated"] is True


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_colliding_iat_overwritten(jwt_service, mock_user):
    """iat in extra_payload should be overwritten by the service."""
    result = jwt_service.generate_jwt(mock_user, scope="read", extra_payload={"iat": 0})
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["iat"] == 1673784000


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_colliding_exp_overwritten(jwt_service, mock_user):
    """exp in extra_payload should be overwritten by the service."""
    result = jwt_service.generate_jwt(
        mock_user, scope="read", extra_payload={"exp": 9999999999}
    )
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["exp"] == 1673787600


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_colliding_user_id_overwritten(
    jwt_service, mock_user
):
    """user_id in extra_payload should be overwritten by the service."""
    result = jwt_service.generate_jwt(
        mock_user, scope="read", extra_payload={"user_id": "hacked"}
    )
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["user_id"] == "test-user-id"


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_extra_payload_not_mutated(jwt_service, mock_user):
    """generate_jwt should not mutate the original extra_payload dict."""
    extra = {"client_id": "my-app"}
    jwt_service.generate_jwt(mock_user, scope="read", extra_payload=extra)

    assert extra == {"client_id": "my-app"}


# -- generate_jwt / user.id casting --


@freeze_time("2023-01-15 12:00:00")
def test_generate_jwt_user_id_cast_from_uuid(jwt_service):
    """user.id as UUID should be cast to str in payload."""
    user = mock.Mock()
    user.id = uuid.UUID("12345678-1234-5678-1234-567812345678")
    result = jwt_service.generate_jwt(user, scope="read")
    payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["user_id"] == "12345678-1234-5678-1234-567812345678"


# -- decode_jwt / Happy path --


def test_decode_jwt_roundtrip(jwt_service, mock_user):
    """Valid token should decode to correct payload."""
    with freeze_time("2023-01-15 12:00:00"):
        result = jwt_service.generate_jwt(
            mock_user, scope="read", extra_payload={"client_id": "my-app"}
        )

    with freeze_time("2023-01-15 12:30:00"):
        payload = jwt_service.decode_jwt(result["access_token"])

    assert payload["user_id"] == "test-user-id"
    assert payload["scope"] == "read"
    assert payload["client_id"] == "my-app"
    assert payload["iss"] == "test-issuer"
    assert payload["aud"] == "test-audience"


# -- decode_jwt / Error mapping --


def test_decode_jwt_expired_raises_token_expired_error(jwt_service, mock_user):
    """Expired token should raise TokenExpiredError."""
    with freeze_time("2023-01-15 12:00:00"):
        result = jwt_service.generate_jwt(mock_user, scope="read")

    with freeze_time("2099-01-01 00:00:00"):
        with pytest.raises(TokenExpiredError):
            jwt_service.decode_jwt(result["access_token"])


def test_decode_jwt_wrong_issuer_raises_token_invalid_error(mock_user):
    """Token with wrong issuer should raise TokenInvalidError."""
    service_a = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer-a",
        audience="audience",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    service_b = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer-b",
        audience="audience",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    result = service_a.generate_jwt(mock_user, scope="read")

    with pytest.raises(TokenInvalidError):
        service_b.decode_jwt(result["access_token"])


def test_decode_jwt_wrong_audience_raises_token_invalid_error(mock_user):
    """Token with wrong audience should raise TokenInvalidError."""
    service_a = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer",
        audience="audience-a",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    service_b = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer",
        audience="audience-b",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    result = service_a.generate_jwt(mock_user, scope="read")

    with pytest.raises(TokenInvalidError):
        service_b.decode_jwt(result["access_token"])


def test_decode_jwt_tampered_signature_raises_token_decode_error(
    jwt_service, mock_user
):
    """Token with tampered signature should raise TokenDecodeError."""
    result = jwt_service.generate_jwt(mock_user, scope="read")
    header, payload, _ = result["access_token"].split(".")
    tampered_token = f"{header}.{payload}.invalidsignature"

    with pytest.raises(TokenDecodeError):
        jwt_service.decode_jwt(tampered_token)


def test_decode_jwt_garbage_string_raises_token_decode_error(jwt_service):
    """Garbage string should raise TokenDecodeError."""
    with pytest.raises(TokenDecodeError):
        jwt_service.decode_jwt("this.is.not.a.valid.token")


def test_decode_jwt_empty_string_raises_token_decode_error(jwt_service):
    """Empty string should raise TokenDecodeError."""
    with pytest.raises(TokenDecodeError):
        jwt_service.decode_jwt("")


def test_decode_jwt_none_raises_token_decode_error(jwt_service):
    """None should raise TokenDecodeError."""
    with pytest.raises(TokenDecodeError):
        jwt_service.decode_jwt(None)


def test_algorithm_mismatch_raises_token_decode_error(mock_user):
    """Token encoded with HS256 decoded expecting RS256 should raise TokenDecodeError."""
    service_hs256 = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="HS256",
        issuer="issuer",
        audience="audience",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    service_rs256 = JwtTokenService(
        secret_key="test-secret-padded-to-32-bytes!!",
        algorithm="RS256",
        issuer="issuer",
        audience="audience",
        expiration_seconds=3600,
        token_type="Bearer",
    )
    result = service_hs256.generate_jwt(mock_user, scope="read")

    with pytest.raises(TokenDecodeError):
        service_rs256.decode_jwt(result["access_token"])
