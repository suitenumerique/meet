"""LiveKit clusters specific exceptions."""


class UnknownLiveKitClusterError(LookupError):
    """Raised when no registered LiveKit cluster has the requested name."""


class LiveKitClusterUnavailableError(TimeoutError):
    """Raised in place of a call to the room service of a LiveKit cluster
    whose circuit breaker refuses it, without reaching the network.

    It is a TimeoutError, so that callers handle it as a call to the cluster
    that timed out.
    """


class LiveKitRoomUnavailableError(Exception):
    """Raised when a LiveKit room cannot be joined for now.

    Either it cannot be placed on any LiveKit cluster, or it cannot be created
    on the one it is placed on. Asking again later may succeed.
    """


class NoCandidateLiveKitClusterError(LiveKitRoomUnavailableError):
    """Raised when no LiveKit cluster may receive new placements."""


class LiveKitRoomCreationError(LiveKitRoomUnavailableError):
    """Raised when a LiveKit cluster fails to create a LiveKit room."""


class PlacementChangedError(LiveKitRoomUnavailableError):
    """Raised when the placement of a LiveKit room keeps changing while
    credentials are handed out for it."""


class LiveKitRoomEndedError(Exception):
    """Raised when a LiveKit room reported deleted ended its meeting."""


class LiveKitRoomCloseError(Exception):
    """Raised when a LiveKit cluster fails to close a LiveKit room live on it."""


class RelocationRefusedError(Exception):
    """Raised when a room cannot be relocated, nothing having changed.

    Its LiveKit room is not placed, or no other LiveKit cluster may receive it,
    or its placement changed meanwhile.
    """
