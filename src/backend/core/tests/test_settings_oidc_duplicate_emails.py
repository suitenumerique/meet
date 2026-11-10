"""Unit tests for the OIDC_ALLOW_DUPLICATE_EMAILS setting."""

from unittest import mock

import pytest

from meet.settings import Test


def test_oidc_allow_duplicate_emails_with_email_fallback_is_refused():
    """Users identified by email cannot share one, so both settings stop the loading."""
    with (
        mock.patch.object(Test, "OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION", True),
        mock.patch.object(Test, "OIDC_ALLOW_DUPLICATE_EMAILS", True),
        pytest.raises(ValueError, match="OIDC_ALLOW_DUPLICATE_EMAILS"),
    ):
        Test.post_setup()
