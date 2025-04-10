"""Authentication Backends for the Meet core app."""

import contextlib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, SuspiciousOperation
from django.utils.translation import gettext_lazy as _

from lasuite.oidc_login.backends import (
    OIDCAuthenticationBackend as LaSuiteOIDCAuthenticationBackend,
)

from core.models import User
from core.services.marketing import (
    ContactCreationError,
    ContactData,
    get_marketing_service,
)


class OIDCAuthenticationBackend(LaSuiteOIDCAuthenticationBackend):
    """Custom OpenID Connect (OIDC) Authentication Backend.

    This class overrides the default OIDC Authentication Backend to accommodate differences
    in the User and Identity models, and handles signed and/or encrypted UserInfo response.
    """

    def get_extra_claims(self, user_info):
        """
        Return extra claims from user_info.

        Args:
          user_info (dict): The user information dictionary.

        Returns:
          dict: A dictionary of extra claims.

        """
        return {
            # Get user's full name from OIDC fields defined in settings
            "full_name": self.compute_full_name(user_info),
            "short_name": user_info.get(settings.OIDC_USERINFO_SHORTNAME_FIELD),
        }

    def post_get_or_create_user(self, user, claims, is_new_user):
        """
        Post-processing after user creation or retrieval.

        Args:
          user (User): The user instance.
          claims (dict): The claims dictionary.
          is_new_user (bool): Indicates if the user was newly created.

        Returns:
        - None

        """
        email = claims["email"]
        if is_new_user and email and settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL:
            self.signup_to_marketing_email(email)

    @staticmethod
    def signup_to_marketing_email(email):
        """Pragmatic approach to newsletter signup during authentication flow.

        Details:
        1. Uses a very short timeout (1s) to prevent blocking the auth process
        2. Silently fails if the marketing service is down/slow to prioritize user experience
        3. Trade-off: May miss some signups but ensures auth flow remains fast

        Note: For a more robust solution, consider using Async task processing (Celery/Django-Q)
        """
        with contextlib.suppress(
            ContactCreationError, ImproperlyConfigured, ImportError
        ):
            marketing_service = get_marketing_service()
            contact_data = ContactData(
                email=email, attributes={"VISIO_SOURCE": ["SIGNIN"]}
            )
            marketing_service.create_contact(
                contact_data, timeout=settings.BREVO_API_TIMEOUT
            )

    def get_existing_user(self, sub, email):
        """Fetch existing user by sub or email."""
        try:
            return User.objects.get(sub=sub)
        except User.DoesNotExist:
            if email and settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION:
                try:
                    return User.objects.get(email__iexact=email)
                except User.DoesNotExist:
                    pass
                except User.MultipleObjectsReturned as e:
                    raise SuspiciousOperation(
                        _("Multiple user accounts share a common email.")
                    ) from e
        return None
