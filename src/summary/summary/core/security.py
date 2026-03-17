"""Application security."""

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import SettingsDeps

security = HTTPBearer()


def verify_tenant_api_key(
    settings: SettingsDeps,
    credentials: HTTPAuthorizationCredentials = Security(security),  # noqa: B008
):
    """Verify the bearer api_key from the Authorization header."""
    api_key = credentials.credentials
    if api_key not in settings.authorized_tenant_api_keys:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return api_key


def verify_tenant_api_key_v2(
    settings: SettingsDeps,
    credentials: HTTPAuthorizationCredentials = Security(security),  # noqa: B008
):
    """Verify the bearer api_key from the Authorization header."""
    api_key = credentials.credentials
    if api_key not in settings.authorized_tenant_api_keys:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return settings.get_authorized_tenant(api_key=api_key)
