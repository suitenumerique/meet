"""
Unit tests for the Application and ApplicationDomain models
"""

# pylint: disable=W0613

from unittest import mock

from django.contrib.auth.hashers import check_password
from django.core.exceptions import ValidationError

import pytest

from core.factories import ApplicationDomainFactory, ApplicationFactory
from core.models import Application, ApplicationDomain, ApplicationScope

pytestmark = pytest.mark.django_db


# Application Model Tests


def test_models_application_str():
    """The str representation should be the name."""
    application = ApplicationFactory(name="My Integration")
    assert str(application) == "My Integration"


def test_models_application_name_maxlength():
    """The name field should be at most 255 characters."""
    ApplicationFactory(name="a" * 255)

    with pytest.raises(ValidationError) as excinfo:
        ApplicationFactory(name="a" * 256)

    assert "Ensure this value has at most 255 characters (it has 256)." in str(
        excinfo.value
    )


def test_models_application_active_default():
    """An application should be active by default."""
    application = Application.objects.create(name="Test App")
    assert application.active is True


def test_models_application_scopes_default():
    """Scopes should default to empty list."""
    application = Application.objects.create(name="Test App")
    assert application.scopes == []


def test_models_application_client_id_auto_generated():
    """Client ID should be automatically generated on creation."""
    application = ApplicationFactory()
    assert application.client_id is not None
    assert len(application.client_id) > 0


def test_models_application_client_id_unique():
    """Client IDs should be unique."""
    app1 = ApplicationFactory()

    with pytest.raises(ValidationError) as excinfo:
        ApplicationFactory(client_id=app1.client_id)

    assert "Application with this Client id already exists." in str(excinfo.value)


def test_models_application_client_id_length(settings):
    """Client ID should match configured length."""

    app1 = ApplicationFactory()
    assert len(app1.client_id) == 40  # default value

    settings.APPLICATION_CLIENT_ID_LENGTH = 20

    app2 = ApplicationFactory()
    assert len(app2.client_id) == 20


def test_models_application_client_secret_auto_generated():
    """Client secret should be automatically generated and hashed on creation."""
    application = ApplicationFactory()

    assert application.client_secret is not None
    assert len(application.client_secret) > 0


def test_models_application_client_secret_hashed_on_save():
    """Client secret should be hashed when saved."""
    plain_secret = "my-plain-secret"

    with mock.patch(
        "core.models.utils.generate_client_secret", return_value=plain_secret
    ):
        application = ApplicationFactory(client_secret=plain_secret)

    # Secret should be hashed, not plain
    assert application.client_secret != plain_secret
    # Should verify with check_password
    assert check_password(plain_secret, application.client_secret) is True


def test_models_application_client_secret_preserves_existing_hash():
    """Re-saving should not re-hash an already hashed secret."""
    application = ApplicationFactory()
    original_hash = application.client_secret

    # Update another field and save
    application.name = "Updated Name"
    application.save()

    # Hash should remain unchanged
    assert application.client_secret == original_hash


def test_models_application_updates_preserve_client_id():
    """Application updates should preserve existing client_id."""
    application = ApplicationFactory()
    original_client_id = application.client_id

    application.name = "Updated Name"
    application.save()

    assert application.client_id == original_client_id


def test_models_application_scopes_valid_choices():
    """Only valid scope choices should be accepted."""
    application = ApplicationFactory(
        scopes=[
            ApplicationScope.ROOMS_LIST,
            ApplicationScope.ROOMS_CREATE,
            ApplicationScope.ROOMS_RETRIEVE,
        ]
    )

    assert len(application.scopes) == 3
    assert ApplicationScope.ROOMS_LIST in application.scopes


def test_models_application_scopes_invalid_choice():
    """Invalid scope choices should raise validation error."""
    with pytest.raises(ValidationError) as excinfo:
        ApplicationFactory(scopes=["invalid:scope"])

    assert "is not a valid choice" in str(excinfo.value)


def test_models_application_can_delegate_email_no_restrictions():
    """Application with no domain restrictions can delegate any email."""
    application = ApplicationFactory()

    assert application.can_delegate_email("user@example.com") is True
    assert application.can_delegate_email("admin@anotherdomain.org") is True


def test_models_application_can_delegate_email_allowed_domain():
    """Application can delegate email from allowed domain."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")

    assert application.can_delegate_email("user@example.com") is True


def test_models_application_can_delegate_email_denied_domain():
    """Application cannot delegate email from non-allowed domain."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")

    assert application.can_delegate_email("user@other.com") is False


def test_models_application_can_delegate_email_case_insensitive():
    """Domain matching should be case-insensitive."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")

    assert application.can_delegate_email("user@EXAMPLE.COM") is True
    assert application.can_delegate_email("user@Example.Com") is True


def test_models_application_can_delegate_email_multiple_domains():
    """Application with multiple allowed domains should check all."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")
    ApplicationDomainFactory(application=application, domain="other.org")

    assert application.can_delegate_email("user@example.com") is True
    assert application.can_delegate_email("admin@other.org") is True
    assert application.can_delegate_email("test@denied.com") is False


# ApplicationDomain Model Tests


def test_models_application_domain_str():
    """The str representation should be the domain."""
    domain = ApplicationDomainFactory(domain="example.com")
    assert str(domain) == "example.com"


def test_models_application_domain_ordering():
    """Domains should be returned ordered by domain name."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="zulu.com")
    ApplicationDomainFactory(application=application, domain="alpha.com")
    ApplicationDomainFactory(application=application, domain="beta.com")

    domains = ApplicationDomain.objects.all()
    assert domains[0].domain == "alpha.com"
    assert domains[1].domain == "beta.com"
    assert domains[2].domain == "zulu.com"


@pytest.mark.parametrize(
    "valid_domain",
    [
        "example.com",
        "sub.example.com",
        "deep.sub.example.com",
        "example-with-dash.com",
        "123.example.com",
    ],
)
def test_models_application_domain_valid_domain(valid_domain):
    """Valid domain names should be accepted."""
    ApplicationDomainFactory(domain=valid_domain)


@pytest.mark.parametrize(
    "invalid_domain",
    [
        "not a domain",
        "example..com",
        "-example.com",
        "example-.com",
        "example.com-",
    ],
)
def test_models_application_domain_invalid_domain(invalid_domain):
    """Invalid domain names should raise validation error."""

    with pytest.raises(ValidationError):
        ApplicationDomainFactory(domain=invalid_domain)


def test_models_application_domain_lowercase_on_save():
    """Domain should be normalized to lowercase on save."""
    domain = ApplicationDomainFactory(domain="EXAMPLE.COM")

    assert domain.domain == "example.com"


def test_models_application_domain_strip_whitespace_on_save():
    """Domain should strip whitespace on save."""
    domain = ApplicationDomainFactory(domain="  example.com  ")

    assert domain.domain == "example.com"


def test_models_application_domain_combined_normalization():
    """Domain should strip and lowercase in one operation."""
    domain = ApplicationDomainFactory(domain="  EXAMPLE.COM  ")

    assert domain.domain == "example.com"


def test_models_application_domain_unique_together():
    """Same domain cannot be added twice to same application."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")

    with pytest.raises(ValidationError) as excinfo:
        ApplicationDomainFactory(application=application, domain="example.com")

    assert "Application domain with this Application and Domain already exists." in str(
        excinfo.value
    )


def test_models_application_domain_same_domain_different_apps():
    """Same domain can belong to different applications."""
    app1 = ApplicationFactory()
    app2 = ApplicationFactory()

    ApplicationDomainFactory(application=app1, domain="example.com")
    ApplicationDomainFactory(application=app2, domain="example.com")

    assert app1.allowed_domains.count() == 1
    assert app2.allowed_domains.count() == 1


def test_models_application_domain_cascade_delete():
    """Deleting application should delete its domains."""
    application = ApplicationFactory()
    ApplicationDomainFactory(application=application, domain="example.com")
    ApplicationDomainFactory(application=application, domain="other.com")

    assert ApplicationDomain.objects.count() == 2

    application.delete()

    assert ApplicationDomain.objects.count() == 0


def test_models_application_domain_related_name():
    """Domains should be accessible via application.allowed_domains."""
    application = ApplicationFactory()
    domain1 = ApplicationDomainFactory(application=application, domain="example.com")
    domain2 = ApplicationDomainFactory(application=application, domain="other.com")

    assert list(application.allowed_domains.all()) == [domain1, domain2]


def test_models_application_domain_filters_delegation():
    """Adding/removing domains should affect can_delegate_email."""
    application = ApplicationFactory()

    # No restrictions initially
    assert application.can_delegate_email("user@example.com") is True

    # Add domain restriction
    domain = ApplicationDomainFactory(application=application, domain="example.com")
    assert application.can_delegate_email("user@example.com") is True
    assert application.can_delegate_email("user@other.com") is False

    # Remove domain restriction
    domain.delete()
    assert application.can_delegate_email("user@other.com") is True
