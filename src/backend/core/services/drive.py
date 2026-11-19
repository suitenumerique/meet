"""Client for La Suite Drive's external API (resource server).

Drive exposes `/external_api/v1.0/*` to applications calling it on behalf of a
user, with either the user's OIDC access token or a token exchanged with Menshen.
See https://github.com/suitenumerique/drive/blob/main/docs/resource_server.md
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

    def __init__(self, message: str, *, status_code=None):
        super().__init__(message)
        self.status_code = status_code

    @classmethod
    def from_request_exception(cls, message: str, exc: requests.RequestException):
        """Build the error from a failed `requests` call, with its status code."""

        response = getattr(exc, "response", None)

        if response is None:
            # No answer at all: connection error, timeout...
            return cls(message)

        status_code = response.status_code
        return cls(f"{message} ({status_code})", status_code=status_code)


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

    The client is bound to a single user token: every call is performed as that
    user, and Drive applies its own permissions accordingly.
    """

    def __init__(self, token: str, *, base_url: str | None = None):
        """Prepare a session authenticated with the user's token."""

        self._base_url = (base_url or settings.DRIVE_API_BASE_URL or "").rstrip("/")

        if not self._base_url:
            raise DriveError(
                "Drive API is not configured, set DRIVE_API_BASE_URL to enable it."
            )

        if not token:
            raise DriveError("A token is required to call Drive.")

        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {token}",
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
            raise DriveError.from_request_exception(
                f"Drive call failed: {method} {path}", exc
            ) from exc

        if not response.content:
            return None

        try:
            return response.json()
        except ValueError as exc:
            raise DriveError(f"Drive returned a non-JSON body for {path}") from exc

    def find_root_folder(self, title: str) -> dict | None:
        """Return the folder titled `title` the user created at the root of Drive.

        Drive's title filter is a case-insensitive "contains" match, and the
        listing also holds items shared with the user: keep only an exact match,
        at the root, created by the user.
        """

        body = self._request(
            "GET",
            "/items/",
            params={"type": "folder", "title": title, "is_creator_me": "true"},
        )
        items = body.get("results", []) if isinstance(body, dict) else body or []

        return next(
            (
                item
                for item in items
                if item.get("type") == "folder"
                and item.get("title") == title
                and item.get("depth") == 1
            ),
            None,
        )

    def create_folder(self, title: str) -> dict:
        """Create a folder at the root of the user's Drive and return it."""

        return self._request("POST", "/items/", json={"type": "folder", "title": title})

    def create_file(self, *, filename: str, parent_id: str | None = None) -> dict:
        """Create a file item, in `parent_id` or at the root, and return it.

        The returned item carries a `policy`: the presigned URL the content has
        to be uploaded to.
        """

        path = f"/items/{parent_id}/children/" if parent_id else "/items/"
        item = self._request("POST", path, json={"type": "file", "filename": filename})

        if not item or not item.get("policy"):
            raise DriveError(
                f"Drive did not return an upload policy for file '{filename}'."
            )

        return item

    def delete_item(self, item_id: str) -> None:
        """Delete an item, which Drive moves to the user's trash.

        Requires the `destroy` action on items in Drive's EXTERNAL_API setting.
        """

        self._request("DELETE", f"/items/{item_id}/")

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
            raise DriveError.from_request_exception(
                "Upload to Drive's object storage failed", exc
            ) from exc

    def complete_upload(self, item_id: str) -> None:
        """Inform Drive that the upload is over, making the file available."""

        self._request("POST", f"/items/{item_id}/upload-ended/", json={})

    def find_user_by_email(self, email: str) -> dict | None:
        """Return the active Drive user with this exact email, if any.

        Drive's user search tolerates typos in emails: the returned emails are
        compared with the expected one, ignoring case.
        """

        users = self._request("GET", "/users/", params={"q": email}) or []
        expected = email.casefold()

        return next(
            (
                user
                for user in users
                if (user.get("email") or "").casefold() == expected
            ),
            None,
        )

    def share_with_email(self, item_id: str, email: str, role: str) -> None:
        """Give `role` on an item to the Drive user with this email.

        An existing user gets an access, an email with no Drive account yet gets
        an invitation, turned into an access when they first log in. Drive emails
        them in both cases.
        """

        user = self.find_user_by_email(email)

        if user:
            self._request(
                "POST",
                f"/items/{item_id}/accesses/",
                json={"user_id": user["id"], "role": role},
            )
        else:
            self._request(
                "POST",
                f"/items/{item_id}/invitations/",
                json={"email": email, "role": role},
            )
