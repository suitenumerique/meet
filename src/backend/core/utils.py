"""
Utils functions used in the core app
"""

# pylint: disable=R0913, R0917
# ruff: noqa:S311, PLR0913

import hashlib
import json
import random
import secrets
import string
from typing import List, Optional
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage

import aiohttp
import botocore
from asgiref.sync import async_to_sync
from livekit.api import (  # pylint: disable=E0611
    AccessToken,
    ListRoomsRequest,
    LiveKitAPI,
    SendDataRequest,
    TwirpError,
    UpdateRoomMetadataRequest,
    VideoGrants,
)


def generate_color(identity: str) -> str:
    """Generates a consistent HSL color based on a given identity string.

    The function seeds the random generator with the identity's hash,
    ensuring consistent color output. The HSL format allows fine-tuned control
    over saturation and lightness, empirically adjusted to produce visually
    appealing and distinct colors. HSL is preferred over hex to constrain the color
    range and ensure predictability.
    """

    # ruff: noqa:S324
    identity_hash = hashlib.sha1(identity.encode("utf-8"))
    # Keep only hash's last 16 bits, collisions are not a concern
    seed = int(identity_hash.hexdigest(), 16) & 0xFFFF
    random.seed(seed)
    hue = random.randint(0, 360)
    saturation = random.randint(50, 75)
    lightness = random.randint(25, 60)

    return f"hsl({hue}, {saturation}%, {lightness}%)"


def generate_token(
    room: str,
    user,
    username: Optional[str] = None,
    color: Optional[str] = None,
    sources: Optional[List[str]] = None,
    is_admin_or_owner: bool = False,
    participant_id: Optional[str] = None,
) -> str:
    """Generate a LiveKit access token for a user in a specific room.

    Args:
        room (str): The name of the room.
        user (User): The user which request the access token.
        username (Optional[str]): The username to be displayed in the room.
                         If none, a default value will be used.
        color (Optional[str]): The color to be displayed in the room.
                         If none, a value will be generated
        sources: (Optional[List[str]]): List of media sources the user can publish
                         If none, defaults to LIVEKIT_DEFAULT_SOURCES.
        is_admin_or_owner (bool): Whether user has admin privileges
        participant_id (Optional[str]): Stable identifier for anonymous users;
                         used as identity when user.is_anonymous.

    Returns:
        str: The LiveKit JWT access token.
    """

    if is_admin_or_owner:
        sources = settings.LIVEKIT_DEFAULT_SOURCES

    if sources is None:
        sources = settings.LIVEKIT_DEFAULT_SOURCES

    video_grants = VideoGrants(
        room=room,
        room_join=True,
        room_admin=is_admin_or_owner,
        can_update_own_metadata=True,
        can_publish=bool(sources),
        can_publish_sources=sources,
        can_subscribe=True,
    )

    if user.is_anonymous:
        identity = participant_id or str(uuid4())
        default_username = "Anonymous"
    else:
        identity = str(user.sub)
        default_username = str(user)

    if color is None:
        color = generate_color(identity)

    token = (
        AccessToken(
            api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
            api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .with_grants(video_grants)
        .with_identity(identity)
        .with_name(username or default_username)
        .with_attributes(
            {"color": color, "room_admin": "true" if is_admin_or_owner else "false"}
        )
    )

    return token.to_jwt()


def generate_livekit_config(
    room_id: str,
    user,
    username: str,
    is_admin_or_owner: bool,
    color: Optional[str] = None,
    configuration: Optional[dict] = None,
    participant_id: Optional[str] = None,
) -> dict:
    """Generate LiveKit configuration for room access.

    Args:
        room_id: Room identifier
        user: User instance requesting access
        username: Display name in room
        is_admin_or_owner (bool): Whether the user has admin/owner privileges for this room.
        color (Optional[str]): Optional color to associate with the participant.
        configuration (Optional[dict]): Room configuration dict that can override default settings.
        participant_id (Optional[str]): Stable identifier for anonymous users;
                         used as identity when user.is_anonymous.

    Returns:
        dict: LiveKit configuration with URL, room and access token
    """

    sources = None
    if configuration is not None:
        sources = configuration.get("can_publish_sources", None)

    return {
        "url": settings.LIVEKIT_CONFIGURATION["url"],
        "room": room_id,
        "token": generate_token(
            room=room_id,
            user=user,
            username=username,
            color=color,
            sources=sources,
            is_admin_or_owner=is_admin_or_owner,
            participant_id=participant_id,
        ),
    }


def generate_s3_authorization_headers(key):
    """
    Generate authorization headers for an s3 object.
    These headers can be used as an alternative to signed urls with many benefits:
    - the urls of our files never expire and can be stored in our recording' metadata
    - we don't leak authorized urls that could be shared (file access can only be done
      with cookies)
    - access control is truly realtime
    - the object storage service does not need to be exposed on internet
    """

    url = default_storage.unsigned_connection.meta.client.generate_presigned_url(
        "get_object",
        ExpiresIn=0,
        Params={"Bucket": default_storage.bucket_name, "Key": key},
    )

    request = botocore.awsrequest.AWSRequest(method="get", url=url)

    s3_client = default_storage.connection.meta.client
    # pylint: disable=protected-access
    credentials = s3_client._request_signer._credentials  # noqa: SLF001
    frozen_credentials = credentials.get_frozen_credentials()
    region = s3_client.meta.region_name
    auth = botocore.auth.S3SigV4Auth(frozen_credentials, "s3", region)
    auth.add_auth(request)

    return request


def create_livekit_client(custom_configuration=None):
    """Create and return a configured LiveKit API client."""

    custom_session = None

    if not settings.LIVEKIT_VERIFY_SSL:
        connector = aiohttp.TCPConnector(ssl=False)
        custom_session = aiohttp.ClientSession(connector=connector)

    # Use default configuration if none provided
    configuration = custom_configuration or settings.LIVEKIT_CONFIGURATION

    return LiveKitAPI(session=custom_session, **configuration)


class NotificationError(Exception):
    """Notification delivery to room participants fails."""


@async_to_sync
async def notify_participants(room_name: str, notification_data: dict):
    """Send notification data to all participants in a LiveKit room."""

    lkapi = create_livekit_client()

    try:
        room_response = await lkapi.room.list_rooms(
            ListRoomsRequest(
                names=[room_name],
            )
        )

        # Check if the room exists
        if not room_response.rooms:
            return

        await lkapi.room.send_data(
            SendDataRequest(
                room=room_name,
                data=json.dumps(notification_data).encode("utf-8"),
                kind="RELIABLE",
            )
        )
    except TwirpError as e:
        raise NotificationError("Failed to notify room participants") from e
    finally:
        await lkapi.aclose()


class MetadataUpdateException(Exception):
    """Room's metadata update fails."""


@async_to_sync
async def update_room_metadata(
    room_name: str, metadata: dict, remove_keys: Optional[list[str]] = None
):
    """Update LiveKit room metadata by merging new values with existing metadata.

    Args:
        room_name: Name of the room to update
        metadata: Dictionary of metadata key-values to add/update
        remove_keys: Optional list of keys to remove from existing metadata.
    """

    lkapi = create_livekit_client()

    try:
        response = await lkapi.room.list_rooms(
            ListRoomsRequest(
                names=[room_name],
            )
        )

        if not response.rooms:
            return

        room = response.rooms[0]

        existing_metadata = json.loads(room.metadata) if room.metadata else {}
        print('$$ existing_metadata')
        print(existing_metadata)

        if remove_keys:
            for key in remove_keys:
                existing_metadata.pop(key, None)

        updated_metadata = {**existing_metadata, **metadata}

        print('$$ updated_metadata')
        print(updated_metadata)

        await lkapi.room.update_room_metadata(
            UpdateRoomMetadataRequest(
                room=room_name, metadata=json.dumps(updated_metadata).encode("utf-8")
            )
        )
    except TwirpError as e:
        raise MetadataUpdateException(
            f"Failed to update metadata for room {room_name}: {e}"
        ) from e
    finally:
        await lkapi.aclose()


ALPHANUMERIC_CHARSET = string.ascii_letters + string.digits


def generate_secure_token(length: int = 30, charset: str = ALPHANUMERIC_CHARSET) -> str:
    """Generate a cryptographically secure random token.

    Uses SystemRandom for proper entropy, suitable for OAuth tokens
    and API credentials that must be non-guessable.

    Inspired by: https://github.com/oauthlib/oauthlib/blob/master/oauthlib/common.py

    Args:
        length: Token length in characters (default: 30)
        charset: Character set to use for generation

    Returns:
        Cryptographically secure random token
    """
    return "".join(secrets.choice(charset) for _ in range(length))


def generate_client_id() -> str:
    """Generate a unique client ID for application authentication.

    Returns:
        Random client ID string
    """
    return generate_secure_token(settings.APPLICATION_CLIENT_ID_LENGTH)


def generate_client_secret() -> str:
    """Generate a secure client secret for application authentication.

    Returns:
        Cryptographically secure client secret
    """
    return generate_secure_token(settings.APPLICATION_CLIENT_SECRET_LENGTH)


def generate_room_slug():
    """Generate a random room slug in the format 'xxx-xxxx-xxx'."""

    sizes = [3, 4, 3]
    parts = [
        "".join(secrets.choice(string.ascii_lowercase) for _ in range(size))
        for size in sizes
    ]
    return "-".join(parts)
