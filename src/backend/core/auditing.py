"""The catalogue of what Meet audits: its actions and the targets that are not models.

It imports nothing but the audit facility and leaf helpers, so that any module can
import it, authentication classes included. Models and authentication classes
are registered in ``core.audit_registry``.
"""

from core import audit
from core.audit import EventCategory, EventType
from core.services.transit_code import TransitCodeService

# Actions

APPLICATION_TOKEN_ISSUE = audit.Action(
    "application.token.issue",
    category=EventCategory.AUTHENTICATION,
    types=(EventType.START,),
)
USER_PROVISION = audit.Action(
    "user.provision",
    category=EventCategory.IAM,
    types=(EventType.USER, EventType.CREATION),
)
TRANSIT_CODE_ISSUE = audit.Action("transit_code.issue", types=(EventType.CREATION,))
TRANSIT_CODE_EXCHANGE = audit.Action(
    "transit_code.exchange",
    category=EventCategory.AUTHENTICATION,
    types=(EventType.START,),
)
ROOM_CREATE = audit.Action("room.create")
ROOM_LIST = audit.Action("room.list")
ROOM_RETRIEVE = audit.Action("room.retrieve")
ROOM_LIVEKIT_TOKEN = audit.Action("room.livekit_token", types=(EventType.CREATION,))
ROOM_DELETE = audit.Action("room.delete")
ROOM_UPDATE = audit.Action("room.update")
RECORDING_START = audit.Action("recording.start", types=(EventType.START,))
RECORDING_STOP = audit.Action("recording.stop", types=(EventType.END,))
RECORDING_END = audit.Action("recording.end", types=(EventType.END,))
RECORDING_DELETE = audit.Action("recording.delete", types=(EventType.DELETION,))
RECORDING_TRANSCRIPT_REQUEST = audit.Action(
    "recording.transcript.request", types=(EventType.START,)
)
RECORDING_TRANSCRIPT_REPORT = audit.Action(
    "recording.transcript.report", types=(EventType.END,)
)
RECORDING_SUMMARY_REPORT = audit.Action(
    "recording.summary.report", types=(EventType.END,)
)

# Targets that are not models


def transit_code_target(code: str) -> dict[str, str]:
    """Describe a transit code as a target, by its digest: never the code itself."""
    return {"id": TransitCodeService.digest(code), "sub_type": "transit_code"}
