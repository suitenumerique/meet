"""Application secrets only: keep fast hashing out of PASSWORD_HASHERS.

Secrets must be securely randomly generated, not human-chosen.
"""

import hashlib
import re

from django.contrib.auth.hashers import check_password
from django.utils.crypto import constant_time_compare, get_random_string
from django.utils.encoding import force_bytes

CLIENT_SECRET_HASH_PREFIX = "sha256$"  # noqa: S105 - format identifier, not a secret

# Accept only the salted format: sha256$<salt>$<digest>.
CLIENT_SECRET_HASH_PATTERN = re.compile(
    rf"{re.escape(CLIENT_SECRET_HASH_PREFIX)}"
    r"(?P<salt>[a-zA-Z0-9]{22})\$(?P<digest>[0-9a-f]{64})"
)


def hash_client_secret(raw_secret):
    """Hash a machine-generated application secret without key stretching."""
    salt = get_random_string(22)
    digest = hashlib.sha256(salt.encode() + force_bytes(raw_secret)).hexdigest()
    return f"{CLIENT_SECRET_HASH_PREFIX}{salt}${digest}"


def verify_client_secret(raw_secret, encoded):
    """Verify the salted application format or a legacy Django password hash."""
    if raw_secret is None:
        return False

    match = CLIENT_SECRET_HASH_PATTERN.fullmatch(encoded)

    # Legacy path
    if not match:
        return check_password(raw_secret, encoded)

    salt = match["salt"]
    digest = hashlib.sha256(salt.encode() + force_bytes(raw_secret)).hexdigest()
    return constant_time_compare(match["digest"], digest)
