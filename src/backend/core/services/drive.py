"""Client for La Suite Drive's external API (OIDC resource server).

Drive exposes `/external_api/v1.0/*` to applications holding an user's OIDC
access token.
"""

import logging
from urllib.parse import urlparse, urlunparse

from django.conf import settings

import requests

logger = logging.getLogger(__name__)

# (connect, read) timeouts, in seconds. The upload one covers a
# whole recording being relayed to Drive's object storage.
API_TIMEOUT = (10, 30)
UPLOAD_TIMEOUT = (10, 1800)


class DriveError(Exception):
    """Raised when Drive's external API cannot fulfill a request."""


class SizedStream:
    """Read-only byte stream of a known size, suitable as a `requests` body.

    `requests` falls back to a chunked transfer encoding when it cannot guess the
    body size upfront, which presigned S3 uploads reject. Advertising the size
    through `__len__` makes it send a plain `Content-Length` instead, while the
    underlying stream is still consumed chunk by chunk.
    """

    def __init__(self, stream, length: int):
        """Wrap `stream`, whose full content is `length` bytes long."""
        self._stream = stream
        self._length = length

    def __len__(self) -> int:
        """Return the total size of the stream, in bytes."""
        return self._length

    def __iter__(self):
        """Iterate over the stream, required for `requests` to stream the body."""
        return iter(self._stream)

    def read(self, amt=None) -> bytes:
        """Read up to `amt` bytes from the stream."""
        return self._stream.read(amt)


class DriveClient:
    """Access Drive's external API on behalf of a user.

    The client is bound to a single user access token: every call is performed
    as that user, and Drive applies its own permissions accordingly.
    """

    def __init__(self, access_token: str, *, base_url: str | None = None):
        """Prepare a session authenticated with the user's OIDC access token."""

        self._base_url = (base_url or settings.DRIVE_API_BASE_URL or "").rstrip("/")

        if not self._base_url:
            raise DriveError(
                "Drive API is not configured, set DRIVE_API_BASE_URL to enable it."
            )

        if not access_token:
            raise DriveError("An access token is required to call Drive.")

        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
        )

    def __enter__(self):
        """Allow use as a context manager, closing the session on exit."""
        return self

    def __exit__(self, *args):
        """Close the underlying HTTP session."""
        self.close()

    def close(self):
        """Release the underlying HTTP session."""
        self._session.close()

    def _request(self, method, path, **kwargs):
        """Perform an authenticated call to the external API and return its body."""

        url = f"{self._base_url}{path}"
        kwargs.setdefault("timeout", API_TIMEOUT)

        try:
            response = self._session.request(method, url, **kwargs)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise DriveError(f"Drive call failed: {method} {url}") from exc

        if not response.content:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise DriveError(f"Drive returned a non-JSON body for {url}") from exc

    def create_file(self, *, filename: str) -> dict:
        """Create a file item at the root of the user's Drive and return it.

        The returned item carries a `policy`: the presigned URL the content has
        to be uploaded to.
        """

        item = self._request(
            "POST",
            "/items/",
            json={"type": "file", "filename": filename},
        )

        if not item or not item.get("policy"):
            raise DriveError(
                f"Drive did not return an upload policy for file '{filename}'."
            )

        return item

    @staticmethod
    def _resolve_upload_target(policy_url: str) -> tuple[str, str | None]:
        """Return the address to connect to, and the `Host` header to send.

        Drive signs its upload URLs with the object storage domain meant for
        browsers, which may not resolve from dev split docker compose setup.
        The signature covers the `Host` header, so we swap the address we connect
        to but keep announcing the original host.
        """

        override = settings.DRIVE_UPLOAD_STORAGE_NETLOC

        if not override:
            return policy_url, None

        parsed = urlparse(policy_url)
        return urlunparse(parsed._replace(netloc=override)), parsed.netloc

    def upload_content(self, *, policy_url: str, stream, content_length, content_type):
        """Push `stream` to the presigned URL, without buffering it as a whole."""

        url, host_header = self._resolve_upload_target(policy_url)

        headers = {
            "Content-Type": content_type,
            "Content-Length": str(content_length),
            "x-amz-acl": "private",
        }

        if host_header:
            headers["Host"] = host_header

        try:
            # A bare `requests.put`, not the authenticated session: the presigned
            # URL carries its own credentials
            response = requests.put(
                url,
                data=SizedStream(stream, content_length),
                headers=headers,
                timeout=UPLOAD_TIMEOUT,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise DriveError("Upload to Drive's object storage failed.") from exc

    def complete_upload(self, item_id: str) -> None:
        """Inform Drive that the upload is over, making the file available."""

        self._request("POST", f"/items/{item_id}/upload-ended/", json={})
