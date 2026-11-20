"""Authentication Backends for the Meet core app."""

import logging

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

from core import audit, auditing
from core.models import DuplicateEmailError, User
from core.utils import normalize_email
from core.validators import sub_validator

logger = logging.getLogger(__name__)


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

        try:
            return User.objects.get_user_by_sub_or_email(sub, email)
        except DuplicateEmailError as err:
            logger.warning("Email already used, not creating user: %s", sub)
            existing_user = (
                User.objects.filter(email=normalize_email(email))
                .order_by("-is_active", "-created_at")
                .first()
            )
            audit.log(
                auditing.USER_PROVISION,
                outcome=audit.Outcome.FAILURE,
                reason=audit.Reason.CONFLICT,
                actor=None,
                actor_type=audit.ActorType.ANONYMOUS,
                auth_method="oidc",
                target=existing_user,
                requested_sub=sub,
            )
            raise SuspiciousOperation(err.message) from err


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
