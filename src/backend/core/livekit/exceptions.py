"""LiveKit clusters specific exceptions."""


class UnknownLiveKitClusterError(LookupError):
    """Raised when no registered LiveKit cluster has the requested name."""


class NoCandidateLiveKitClusterError(Exception):
    """Raised when no LiveKit cluster may receive new placements."""
