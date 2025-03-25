"""Authentication Backends for the Meet core app."""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, SuspiciousOperation
from django.utils.translation import gettext_lazy as _

import requests
from mozilla_django_oidc.auth import (
    OIDCAuthenticationBackend as MozillaOIDCAuthenticationBackend,
)

from core.models import User
from core.services.marketing import (
    ContactCreationError,
    ContactData,
    get_marketing_service,
)


class OIDCAuthenticationBackend(MozillaOIDCAuthenticationBackend):
    """Custom OpenID Connect (OIDC) Authentication Backend.

    This class overrides the default OIDC Authentication Backend to accommodate differences
    in the User and Identity models, and handles signed and/or encrypted UserInfo response.
    """

    def get_userinfo(self, access_token, id_token, payload):
        """Return user details dictionary.

        Parameters:
        - access_token (str): The access token.
        - id_token (str): The id token (unused).
        - payload (dict): The token payload (unused).

        Note: The id_token and payload parameters are unused in this implementation,
        but were kept to preserve base method signature.

        Note: It handles signed and/or encrypted UserInfo Response. It is required by
        Agent Connect, which follows the OIDC standard. It forces us to override the
        base method, which deal with 'application/json' response.

        Returns:
        - dict: User details dictionary obtained from the OpenID Connect user endpoint.
        """

        user_response = requests.get(
            self.OIDC_OP_USER_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
            verify=self.get_settings("OIDC_VERIFY_SSL", True),
            timeout=self.get_settings("OIDC_TIMEOUT", None),
            proxies=self.get_settings("OIDC_PROXY", None),
        )
        user_response.raise_for_status()
        userinfo = self.verify_token(user_response.text)
        return userinfo

    def get_or_create_user(self, access_token, id_token, payload):
        """Return a User based on userinfo. Get or create a new user if no user matches the Sub.

        Parameters:
        - access_token (str): The access token.
        - id_token (str): The ID token.
        - payload (dict): The user payload.

        Returns:
        - User: An existing or newly created User instance.

        Raises:
        - Exception: Raised when user creation is not allowed and no existing user is found.
        """

        user_info = self.get_userinfo(access_token, id_token, payload)
        sub = user_info.get("sub")

        if not sub:
            raise SuspiciousOperation(
                _("User info contained no recognizable user identification")
            )

        email = user_info.get("email")
        user = self.get_existing_user(sub, email)

        claims = {
            "email": email,
            "full_name": self.compute_full_name(user_info),
            "short_name": user_info.get(settings.OIDC_USERINFO_SHORTNAME_FIELD),
        }
        if not user and self.get_settings("OIDC_CREATE_USER", True):
            user = User.objects.create(
                sub=sub,
                password="!",  # noqa: S106
                **claims,
            )

            if settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL:
                self.signup_to_marketing_email(email)

        elif not user:
            return None

        if not user.is_active:
            raise SuspiciousOperation(_("User account is disabled"))

        self.update_user_if_needed(user, claims)

        return user

    @staticmethod
    def signup_to_marketing_email(email):
        """Pragmatic approach to newsletter signup during authentication flow.

        Details:
        1. Uses a very short timeout (1s) to prevent blocking the auth process
        2. Silently fails if the marketing service is down/slow to prioritize user experience
        3. Trade-off: May miss some signups but ensures auth flow remains fast

        Note: For a more robust solution, consider using Async task processing (Celery/Django-Q)
        """
        try:
            marketing_service = get_marketing_service()
            contact_data = ContactData(
                email=email, attributes={"VISIO_SOURCE": ["SIGNIN"]}
            )
            marketing_service.create_contact(
                contact_data, timeout=settings.BREVO_API_TIMEOUT
            )
        except (ContactCreationError, ImproperlyConfigured, ImportError):
            pass

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

    @staticmethod
    def compute_full_name(user_info):
        """Compute user's full name based on OIDC fields in settings."""
        full_name = " ".join(
            filter(
                None,
                (
                    user_info.get(field)
                    for field in settings.OIDC_USERINFO_FULLNAME_FIELDS
                ),
            )
        )
        return full_name or None

    @staticmethod
    def update_user_if_needed(user, claims):
        """Update user claims if they have changed."""
        user_fields = vars(user.__class__)  # Get available model fields
        updated_claims = {
            key: value
            for key, value in claims.items()
            if value and key in user_fields and value != getattr(user, key)
        }

        if not updated_claims:
            return

        User.objects.filter(sub=user.sub).update(**updated_claims)
