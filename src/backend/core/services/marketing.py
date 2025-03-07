"""Marketing service in charge of pushing data for marketing automation."""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Protocol

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.module_loading import import_string

import brevo_python

logger = logging.getLogger(__name__)


class ContactCreationError(Exception):
    """Raised when the contact creation fails."""


@dataclass
class ContactData:
    """Contact data for marketing service integration."""

    email: str
    attributes: Optional[Dict[str, str]] = None
    list_ids: Optional[List[int]] = None
    update_enabled: bool = True


class MarketingServiceProtocol(Protocol):
    """Interface for marketing automation service integrations."""

    def create_contact(
        self, contact_data: ContactData, timeout: Optional[int] = None
    ) -> dict:
        """Create or update a contact.

        Args:
            contact_data: Contact information and attributes
            timeout: API request timeout in seconds

        Returns:
            dict: Service response

        Raises:
            ContactCreationError: If contact creation fails
        """


class BrevoMarketingService:
    """Brevo marketing automation integration.

    Handles:
    - Contact management and segmentation
    - Marketing campaigns and automation
    - Email communications

    Configuration via Django settings:
    - BREVO_API_KEY: API authentication
    - BREVO_API_CONTACT_LIST_IDS: Default contact lists
    - BREVO_API_CONTACT_ATTRIBUTES: Default contact attributes
    """

    def __init__(self):
        """Initialize Brevo (ex-sendinblue) marketing service."""

        if not settings.BREVO_API_KEY:
            raise ImproperlyConfigured("Brevo API key is required")

        configuration = brevo_python.Configuration()
        configuration.api_key["api-key"] = settings.BREVO_API_KEY

        self._api_client = brevo_python.ApiClient(configuration)

    def create_contact(self, contact_data: ContactData, timeout=None) -> dict:
        """Create or update a Brevo contact.

        Args:
            contact_data: Contact information and attributes
            timeout: API request timeout in seconds

        Returns:
            dict: Brevo API response

        Raises:
            ContactCreationError: If contact creation fails
            ImproperlyConfigured: If required settings are missing

        Note:
            Contact attributes must be pre-configured in Brevo.
            Changes to attributes can impact existing workflows.
        """

        if not settings.BREVO_API_CONTACT_LIST_IDS:
            raise ImproperlyConfigured(
                "Default Brevo List IDs must be configured in settings."
            )

        contact_api = brevo_python.ContactsApi(self._api_client)

        attributes = {
            **settings.BREVO_API_CONTACT_ATTRIBUTES,
            **(contact_data.attributes or {}),
        }

        list_ids = (contact_data.list_ids or []) + settings.BREVO_API_CONTACT_LIST_IDS

        contact = brevo_python.CreateContact(
            email=contact_data.email,
            attributes=attributes,
            list_ids=list_ids,
            update_enabled=contact_data.update_enabled,
        )

        api_configurations = {}

        if timeout is not None:
            api_configurations["_request_timeout"] = timeout

        try:
            response = contact_api.create_contact(contact, **api_configurations)
        except brevo_python.rest.ApiException as err:
            logger.exception("Failed to create contact in Brevo")
            raise ContactCreationError("Failed to create contact in Brevo") from err

        return response


@lru_cache(maxsize=1)
def get_marketing_service() -> MarketingServiceProtocol:
    """Return cached instance of configured marketing service."""
    marketing_service_cls = import_string(settings.MARKETING_SERVICE_CLASS)
    return marketing_service_cls()
