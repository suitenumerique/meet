"""Authentication Backends for the Meet core app."""

from django.conf import settings
from django.core.exceptions import (
    SuspiciousOperation,
    ValidationError,
)
from django.utils.translation import gettext_lazy as _

from lasuite.marketing.tasks import create_or_update_contact
from lasuite.oidc_login.backends import (
    OIDCAuthenticationBackend as LaSuiteOIDCAuthenticationBackend,
)
from rest_framework.authentication import SessionAuthentication

from core.models import User
from core.validators import sub_validator


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
        # The stored claims mirror the latest userinfo response: a configured
        # claim that is absent from it is stored as None, and a claim that is no
        # longer configured disappears on the user's next login. They are kept
        # verbatim and never used to identify the user, so a claim that also has
        # a dedicated field (given_name, email, ...) is simply stored twice.
        claims_to_store = {
            claim: user_info.get(claim)
            for claim in settings.OIDC_USERINFO_STORED_CLAIMS
        }
        return {
            # Get user's full name from OIDC fields defined in settings
            "full_name": self.compute_full_name(user_info),
            "short_name": user_info.get(settings.OIDC_USERINFO_SHORTNAME_FIELD),
            "claims": claims_to_store,
        }

    def update_user_if_needed(self, user, claims):
        """
        Update the user from the claims, also when the stored claims were emptied.

        The base implementation skips falsy values, so an empty mapping (nothing
        configured in OIDC_USERINFO_STORED_CLAIMS anymore) would leave the
        previously stored claims behind.
        """
        super().update_user_if_needed(user, claims)

        if claims.get("claims") == {} and user.claims:
            user.claims = {}
            user.save(update_fields=["claims"])

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
        """Add the user to the newsletter list on sign-in.

        Uses the team's standard Brevo integration, dispatching the contact
        creation/update as an asynchronous task to keep authentication fast.
        """
        create_or_update_contact.delay(
            email=email,
            attributes={"VISIO_SOURCE": ["SIGNIN"]},
        )

    def get_existing_user(self, sub, email):
        """Fetch existing user by sub or email."""

        sub = str(sub)

        try:
            sub_validator(sub)
        except ValidationError as err:
            raise SuspiciousOperation(
                "User info contained an invalid sub claim"
            ) from err

        if len(sub) > 255:
            raise SuspiciousOperation("User info contained an invalid sub claim")

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
                        "Multiple user accounts share a common email."
                    ) from e
        return None


class SessionAuthenticationWith401(SessionAuthentication):
    """
    Identical to DRF's SessionAuthentication, but returns a WWW-Authenticate
    header so unauthenticated requests get a 401 instead of a 403.

    The scheme is deliberately NOT 'Basic' — that would trigger the browser's
    native login popup. 'Session' is ignored by the browser's auth UI but is
    still truthy, so DRF keeps the status at 401.
    """

    def authenticate_header(self, request):
        return "Session"
