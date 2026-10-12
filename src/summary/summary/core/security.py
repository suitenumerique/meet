"""Application security."""

from typing import Annotated

from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import AuthorizedTenant, SettingsDeps

security = HTTPBearer()


def verify_tenant_api_key(
    settings: SettingsDeps,
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
):
    """Verify the bearer api_key from the Authorization header."""
    api_key = credentials.credentials
    if api_key not in settings.authorized_tenant_api_keys:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return api_key


def verify_tenant_api_key_v2(
    settings: SettingsDeps,
    credentials: Annotated[HTTPAuthorizationCredentials, Security(security)],
) -> AuthorizedTenant:
    """Verify the bearer api_key from the Authorization header."""
    api_key = credentials.credentials
    if api_key not in settings.authorized_tenant_api_keys:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return settings.get_authorized_tenant(api_key=api_key)


TenantDeps = Annotated[AuthorizedTenant, Depends(verify_tenant_api_key_v2)]
