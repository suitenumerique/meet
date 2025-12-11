"""Application security."""

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import SettingsDeps

security = HTTPBearer()


def verify_token(
    settings: SettingsDeps,
    credentials: HTTPAuthorizationCredentials = Security(security),  # noqa: B008
):
    """Verify the bearer token from the Authorization header."""
    token = credentials.credentials
    if token != settings.app_api_token.get_secret_value():
        raise HTTPException(status_code=401, detail="Invalid token")
    return token
