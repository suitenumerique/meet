"""What Meet audits, and what its audit events may say.

Imported by the audit app once it is ready, see ``core.audit.apps``.
"""

from django.contrib.auth.models import Group

from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication

from core import audit, models
from core.audit import EventCategory, EventType
from core.authentication.backends import OIDCAuthenticationBackend
from core.authentication.livekit import LiveKitTokenAuthentication
from core.external_api.authentication import (
    AddonsJWTAuthentication,
    ApplicationJWTAuthentication,
)
from core.recording.event.authentication import HeaderBasedAuthentication
from core.roomkit.authentication import ServerToServerAuthentication

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
ROOM_CREATE = audit.Action("room.create")
ROOM_LIST = audit.Action("room.list")
ROOM_RETRIEVE = audit.Action("room.retrieve")
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

# Models

audit.register(
    models.User,
    category=EventCategory.IAM,
    admin_values=(
        "is_active",
        "is_staff",
        "is_superuser",
        "is_device",
        "groups",
        "user_permissions",
    ),
)
audit.register(Group, category=EventCategory.IAM, admin_values=("name", "permissions"))
audit.register(
    models.Application,
    category=EventCategory.IAM,
    entity_type="application",
    fields=("client_id", "name", "is_active", "scopes"),
    admin_values=("name", "is_active", "scopes"),
)
audit.register(
    models.ApplicationDomain, category=EventCategory.IAM, admin_values=("domain",)
)
audit.register(
    models.ResourceAccess,
    category=EventCategory.IAM,
    fields=("resource_id", "user_id", "role"),
    admin_values=("role",),
    user_target="user",
)
audit.register(
    models.RecordingAccess,
    category=EventCategory.IAM,
    admin_values=("role",),
    user_target="user",
)
audit.register(
    models.Room,
    fields=("slug", "name", "access_level"),
    admin_values=("name", "slug", "access_level", "configuration"),
)
audit.register(
    models.Recording,
    fields=("room_id", "status", "mode", "requested_mode", "is_transcribed"),
    admin_values=("status", "mode"),
)
audit.register(models.File, admin_values=("title", "upload_state"))

# Authentication classes and login backends -> ``lasuite.auth.method``

audit.register_auth_method(OIDCAuthenticationBackend, "oidc")
audit.register_auth_method(ApplicationJWTAuthentication, "application_jwt")
audit.register_auth_method(AddonsJWTAuthentication, "addons_jwt")
audit.register_auth_method(ResourceServerAuthentication, "resource_server")
audit.register_auth_method(LiveKitTokenAuthentication, "livekit_token")
audit.register_auth_method(HeaderBasedAuthentication, "shared_secret")
audit.register_auth_method(ServerToServerAuthentication, "shared_secret")
