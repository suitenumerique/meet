"""LiveKit API client."""

from livekit.api import LiveKitAPI


class LiveKitClient(LiveKitAPI):
    """A LiveKit API client that closes the session it is given."""

    async def aclose(self):
        """Close the session, which LiveKitAPI leaves open when it did not create it."""
        await self._session.close()
