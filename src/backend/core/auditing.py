"""What Meet audits, and what its audit events may say.

Imported by the audit app once it is ready, see ``core.audit.apps``.
"""

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

# Models

audit.register(models.Application, fields=("client_id", "name", "is_active", "scopes"))
audit.register(models.ResourceAccess, fields=("resource_id", "user_id", "role"))
audit.register(models.Room, fields=("slug", "name", "access_level"))
audit.register(models.Recording, fields=("room_id", "status", "mode"))

# Authentication classes and login backends -> ``lasuite.auth.method``

audit.register_auth_method(OIDCAuthenticationBackend, "oidc")
audit.register_auth_method(ApplicationJWTAuthentication, "application_jwt")
audit.register_auth_method(AddonsJWTAuthentication, "addons_jwt")
audit.register_auth_method(ResourceServerAuthentication, "resource_server")
audit.register_auth_method(LiveKitTokenAuthentication, "livekit_token")
audit.register_auth_method(HeaderBasedAuthentication, "shared_secret")
audit.register_auth_method(ServerToServerAuthentication, "shared_secret")
