"""Application secrets only: keep fast hashing out of PASSWORD_HASHERS.

Secrets must be securely randomly generated, not human-chosen.
"""

import hashlib
import re

from django.contrib.auth.hashers import check_password
from django.utils.crypto import constant_time_compare
from django.utils.encoding import force_bytes

CLIENT_SECRET_HASH_ALGORITHM = "sha256"
CLIENT_SECRET_HASH_VERSION = "v0"
CLIENT_SECRET_HASH_PREFIX = (  # noqa: S105 - format identifier, not a secret
    f"{CLIENT_SECRET_HASH_ALGORITHM}${CLIENT_SECRET_HASH_VERSION}$"
)

# Accept only the versioned format: sha256$v0$<digest>.
CLIENT_SECRET_HASH_PATTERN = re.compile(
    rf"{re.escape(CLIENT_SECRET_HASH_PREFIX)}(?P<digest>[0-9a-f]{{64}})"
)


def _digest(raw_secret):
    """Return the hex SHA-256 digest of a raw secret."""
    return hashlib.sha256(force_bytes(raw_secret)).hexdigest()


def hash_client_secret(raw_secret):
    """Hash a machine-generated application secret without key stretching."""
    return f"{CLIENT_SECRET_HASH_PREFIX}{_digest(raw_secret)}"


def verify_client_secret(raw_secret, encoded):
    """Verify the versioned application format or a legacy Django password hash."""
    if raw_secret is None:
        return False

    match = CLIENT_SECRET_HASH_PATTERN.fullmatch(encoded)

    # Legacy path
    if not match:
        return check_password(raw_secret, encoded)

    return constant_time_compare(match["digest"], _digest(raw_secret))
