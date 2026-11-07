"""Tasks related to connection test rooms."""

import logging
from typing import Optional

from django.conf import settings

from core.livekit.clusters import get_default_livekit_cluster, get_livekit_cluster
from core.livekit.exceptions import UnknownLiveKitClusterError
from core.services.room_management import (
    RoomManagement,
    RoomManagementException,
    RoomNotFoundException,
)
from core.tasks._task import task

logger = logging.getLogger(__name__)


@task
def delete_connection_test_room(room_name: str, cluster_name: Optional[str] = None):
    """Force-delete an ephemeral connection-test room.

    Used as a hard cap so a participant cannot keep an auto-refreshed
    LiveKit session open indefinitely after requesting a test token.
    """
    prefix = settings.CONNECTION_TEST_ROOM_PREFIX
    if not room_name.startswith(prefix):
        logger.error(
            "Refusing to delete room '%s': expected prefix '%s'.",
            room_name,
            prefix,
        )
        return

    if cluster_name is None:
        cluster = get_default_livekit_cluster()
    else:
        try:
            cluster = get_livekit_cluster(cluster_name)
        except UnknownLiveKitClusterError:
            cluster = get_default_livekit_cluster()
            logger.warning(
                "Connection test room '%s' was created on LiveKit cluster %s, "
                "which is not registered: deleting it on the default cluster %s.",
                room_name,
                cluster_name,
                cluster.name,
            )

    try:
        RoomManagement.delete_room(room_name, cluster=cluster)
    except RoomNotFoundException:
        # Room may already be gone after empty/departure timeout.
        logger.info("Connection test room '%s' already gone.", room_name)
    except RoomManagementException:
        logger.exception("Failed to delete connection test room '%s'.", room_name)
