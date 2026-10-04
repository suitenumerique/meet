"""ECS enums shared by every audit event."""

from enum import StrEnum


class Outcome(StrEnum):
    """Whether the audited action succeeded, failed, or was refused."""

    SUCCESS = "success"
    FAILURE = "failure"
    DENIED = "denied"


class Reason(StrEnum):
    """Why an action did not succeed."""

    AUTHENTICATION_FAILED = "authentication_failed"
    PERMISSION_DENIED = "permission_denied"
    RATE_LIMITED = "rate_limited"
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    INTERNAL_ERROR = "internal_error"


class ActorType(StrEnum):
    """Kind of principal behind an action.

    ``user.*`` is the account whose authority the action used: the actor for
    ``user``, the delegating user for ``application``, absent otherwise.
    """

    # A person's account acting for itself.
    USER = "user"
    # A client application acting on behalf of a user, named by its client id.
    APPLICATION = "application"
    # An internal peer of the deployment acting on its own behalf with a
    # shared secret, named by ``lasuite.actor.name``. Never an account.
    SERVICE = "service"
    # The backend itself, with no inbound request.
    SYSTEM = "system"
    # A caller that did not authenticate, or failed to.
    ANONYMOUS = "anonymous"


class EventCategory(StrEnum):
    """Subset of the ECS ``event.category`` ."""

    API = "api"
    AUTHENTICATION = "authentication"
    CONFIGURATION = "configuration"
    EMAIL = "email"
    FILE = "file"
    IAM = "iam"
    SESSION = "session"
    WEB = "web"


class EventType(StrEnum):
    """Subset of the ECS ``event.type``."""

    ACCESS = "access"
    ADMIN = "admin"
    ALLOWED = "allowed"
    CHANGE = "change"
    CREATION = "creation"
    DELETION = "deletion"
    DENIED = "denied"
    END = "end"
    ERROR = "error"
    GROUP = "group"
    INFO = "info"
    START = "start"
    USER = "user"
