"""LiveKit clusters specific exceptions."""


class UnknownLiveKitClusterError(LookupError):
    """Raised when no registered LiveKit cluster has the requested name."""
