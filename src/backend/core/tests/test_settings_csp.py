"""Tests for the Content Security Policy of the pages rendered by Django."""

import re
from types import SimpleNamespace

import pytest

from core import factories

from meet.settings import Development, Production, get_content_security_policy

pytestmark = [
    pytest.mark.django_db,
    pytest.mark.usefixtures("static_files_without_manifest"),
]

REPORT_URI = "https://csp.example.com/report"


@pytest.mark.parametrize(
    ("configuration", "setting", "unset"),
    [
        (Development, "SECURE_CSP", "SECURE_CSP_REPORT_ONLY"),
        (Production, "SECURE_CSP_REPORT_ONLY", "SECURE_CSP"),
    ],
)
def test_settings_csp_configurations(configuration, setting, unset):
    """Development should enforce the policy and Production only report violations."""
    configured = SimpleNamespace(CSP_REPORT_URI=REPORT_URI)

    policy = getattr(configuration, setting).fget(configured)

    assert policy == get_content_security_policy(REPORT_URI)
    assert getattr(configuration, unset) == {}  # Django's default: no header


def test_settings_csp_admin_page_is_allowed(client, settings):
    """
    The policy should allow the admin: its scripts, styles and stylesheets carry
    the request's nonce, and it has no inline style attribute or event handler.
    """
    settings.SECURE_CSP = get_content_security_policy()
    client.force_login(factories.UserFactory(is_staff=True, is_superuser=True))
    recording = factories.RecordingFactory()

    response = client.get(f"/admin/core/recording/{recording.id}/change/")

    assert response.status_code == 200
    policy = response.headers["Content-Security-Policy"]
    assert "Content-Security-Policy-Report-Only" not in response.headers
    assert "report-uri" not in policy
    nonce = re.search(r"script-src 'self' 'nonce-([^']+)'", policy).group(1)
    content = response.content.decode()
    tags = re.findall(
        r"<script\b[^>]*>|<style\b[^>]*>|<link\b[^>]*stylesheet[^>]*>", content
    )
    assert tags
    for tag in tags:
        assert f'nonce="{nonce}"' in tag
    assert not re.search(r"\s(?:style|on[a-z]+)=", content)


def test_settings_csp_report_only(client, settings):
    """A report-only policy should be sent with its report URI and block nothing."""
    settings.SECURE_CSP_REPORT_ONLY = get_content_security_policy(REPORT_URI)

    response = client.get("/admin/login/")

    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers
    assert response.headers["Content-Security-Policy-Report-Only"].endswith(
        f"; report-uri {REPORT_URI}"
    )


@pytest.mark.parametrize("url", ["/api/v1.0/swagger/", "/api/v1.0/redoc/"])
def test_settings_csp_api_docs_exempted(client, settings, url):
    """
    Swagger runs an inline script, and both API docs use inline styles without a
    nonce (Redoc also loads Google Fonts): they should send no policy.
    """
    settings.SECURE_CSP = get_content_security_policy()
    settings.SECURE_CSP_REPORT_ONLY = get_content_security_policy()

    response = client.get(url)

    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers
    assert "Content-Security-Policy-Report-Only" not in response.headers
