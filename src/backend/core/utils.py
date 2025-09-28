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
    VideoGrants,
)


def generate_slug():
    """Generate a random room slug in the format 'xxx-xxxx-xxx'."""

    sizes = [3, 4, 3]
    parts = [
        "".join(secrets.choice(string.ascii_lowercase) for _ in range(size))
        for size in sizes
    ]
    return "-".join(parts)


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
