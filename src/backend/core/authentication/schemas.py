"""Pydantic models for authentication-related operations."""

from typing import Literal

from pydantic import BaseModel, Field


class PKCEAuthenticationRequestModel(BaseModel):
    """Model for generating PKCE authentication requests."""

    code_challenge: str = Field(
        min_length=43, max_length=128, pattern=r"^[A-Za-z0-9\-_]+$"
    )
    code_challenge_method: Literal["S256"] = Field(
        default="S256", description="Code challenge method for PKCE authentication"
    )
    state: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9\-_]+$")


class PKCETokenExchangeModel(BaseModel):
    """Model for exchanging PKCE tokens."""

    code: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9\-_]+$")
    code_verifier: str = Field(
        min_length=43, max_length=128, pattern=r"^[A-Za-z0-9\-_]+$"
    )
