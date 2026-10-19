"""How Meet describes itself to the audit facility: its models and authentication classes.

Imported by the audit app once it is ready, see ``core.audit.apps``. The actions
Meet audits are declared in ``core.auditing``.
"""

from django.contrib.auth.models import Group

from lasuite.oidc_resource_server.authentication import ResourceServerAuthentication

from core import audit, models
from core.audit import EventCategory
from core.authentication.backends import OIDCAuthenticationBackend
from core.authentication.livekit import LiveKitTokenAuthentication
from core.authentication.user_token import UserAccessJWTAuthentication
from core.external_api.authentication import (
    AddonsJWTAuthentication,
    ApplicationJWTAuthentication,
    MenshenAuthentication,
)
from core.recording.event.authentication import HeaderBasedAuthentication
from core.roomkit.authentication import ServerToServerAuthentication

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
audit.register_auth_method(MenshenAuthentication, "menshen_token")
audit.register_auth_method(LiveKitTokenAuthentication, "livekit_token")
audit.register_auth_method(UserAccessJWTAuthentication, "user_access_jwt")
audit.register_auth_method(HeaderBasedAuthentication, "shared_secret")
audit.register_auth_method(ServerToServerAuthentication, "shared_secret")
