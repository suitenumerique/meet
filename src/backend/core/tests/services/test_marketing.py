"""
Test marketing services.
"""

# pylint: disable=W0621,W0613

from unittest import mock

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

import brevo_python
import pytest

from core.services.marketing import (
    BrevoMarketingService,
    ContactCreationError,
    ContactData,
    get_marketing_service,
)


def test_init_missing_api_key(settings):
    """Test initialization with missing API key."""
    settings.BREVO_API_KEY = None
    with pytest.raises(ImproperlyConfigured, match="Brevo API key is required"):
        BrevoMarketingService()


def test_create_contact_missing_list_ids(settings):
    """Test contact creation with missing list IDs."""

    settings.BREVO_API_KEY = "test-api-key"
    settings.BREVO_API_CONTACT_LIST_IDS = None
    settings.BREVO_API_CONTACT_ATTRIBUTES = {"source": "test"}

    valid_contact_data = ContactData(
        email="test@example.com",
        attributes={"first_name": "Test"},
        list_ids=[1, 2],
        update_enabled=True,
    )

    brevo_service = BrevoMarketingService()

    with pytest.raises(
        ImproperlyConfigured, match="Default Brevo List IDs must be configured"
    ):
        brevo_service.create_contact(valid_contact_data)


@mock.patch("brevo_python.ContactsApi")
def test_create_contact_success(mock_contact_api):
    """Test successful contact creation."""

    mock_api = mock_contact_api.return_value

    settings.BREVO_API_KEY = "test-api-key"
    settings.BREVO_API_CONTACT_LIST_IDS = [1, 2, 3, 4]
    settings.BREVO_API_CONTACT_ATTRIBUTES = {"source": "test"}

    valid_contact_data = ContactData(
        email="test@example.com",
        attributes={"first_name": "Test"},
        list_ids=[1, 2],
        update_enabled=True,
    )

    brevo_service = BrevoMarketingService()

    mock_api.create_contact.return_value = {"id": "test-id"}
    response = brevo_service.create_contact(valid_contact_data)

    assert response == {"id": "test-id"}

    mock_api.create_contact.assert_called_once()
    contact_arg = mock_api.create_contact.call_args[0][0]
    assert contact_arg.email == "test@example.com"
    assert contact_arg.attributes == {
        **settings.BREVO_API_CONTACT_ATTRIBUTES,
        **valid_contact_data.attributes,
    }
    assert set(contact_arg.list_ids) == {1, 2, 3, 4}
    assert contact_arg.update_enabled is True


@mock.patch("brevo_python.ContactsApi")
def test_create_contact_with_timeout(mock_contact_api):
    """Test contact creation with timeout."""

    mock_api = mock_contact_api.return_value

    settings.BREVO_API_KEY = "test-api-key"
    settings.BREVO_API_CONTACT_LIST_IDS = [1, 2, 3, 4]
    settings.BREVO_API_CONTACT_ATTRIBUTES = {"source": "test"}

    valid_contact_data = ContactData(
        email="test@example.com",
        attributes={"first_name": "Test"},
        list_ids=[1, 2],
        update_enabled=True,
    )

    brevo_service = BrevoMarketingService()
    brevo_service.create_contact(valid_contact_data, timeout=30)

    mock_api.create_contact.assert_called_once()
    assert mock_api.create_contact.call_args[1]["_request_timeout"] == 30


@mock.patch("brevo_python.ContactsApi")
def test_create_contact_api_error(mock_contact_api):
    """Test contact creation API error handling."""

    mock_api = mock_contact_api.return_value

    settings.BREVO_API_KEY = "test-api-key"
    settings.BREVO_API_CONTACT_LIST_IDS = [1, 2, 3, 4]
    settings.BREVO_API_CONTACT_ATTRIBUTES = {"source": "test"}

    valid_contact_data = ContactData(
        email="test@example.com",
        attributes={"first_name": "Test"},
        list_ids=[1, 2],
        update_enabled=True,
    )

    brevo_service = BrevoMarketingService()

    mock_api.create_contact.side_effect = brevo_python.rest.ApiException()

    with pytest.raises(ContactCreationError, match="Failed to create contact in Brevo"):
        brevo_service.create_contact(valid_contact_data)


@pytest.fixture
def clear_marketing_cache():
    """Clear marketing service cache between tests."""
    get_marketing_service.cache_clear()
    yield
    get_marketing_service.cache_clear()


def test_get_marketing_service_caching(clear_marketing_cache):
    """Test marketing service caching behavior."""
    settings.BREVO_API_KEY = "test-api-key"
    settings.MARKETING_SERVICE_CLASS = "core.services.marketing.BrevoMarketingService"

    service1 = get_marketing_service()
    service2 = get_marketing_service()

    assert service1 is service2
    assert isinstance(service1, BrevoMarketingService)


def test_get_marketing_service_invalid_class(clear_marketing_cache):
    """Test handling of invalid service class."""
    settings.MARKETING_SERVICE_CLASS = "invalid.service.path"

    with pytest.raises(ImportError):
        get_marketing_service()


@mock.patch("core.services.marketing.import_string")
def test_service_instantiation_called_once(mock_import_string, clear_marketing_cache):
    """Test service class is instantiated only once."""

    settings.BREVO_API_KEY = "test-api-key"
    settings.MARKETING_SERVICE_CLASS = "core.services.marketing.BrevoMarketingService"
    get_marketing_service.cache_clear()

    mock_service_cls = mock.Mock()
    mock_service_instance = mock.Mock()
    mock_service_cls.return_value = mock_service_instance
    mock_import_string.return_value = mock_service_cls

    service1 = get_marketing_service()
    service2 = get_marketing_service()

    mock_import_string.assert_called_once_with(settings.MARKETING_SERVICE_CLASS)
    mock_service_cls.assert_called_once()
    assert service1 is service2
    assert service1 is mock_service_instance
