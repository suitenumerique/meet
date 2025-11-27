"""
Declare and configure the models for the Meet core application
"""

import secrets
import uuid
from datetime import datetime, timedelta
from logging import getLogger
from typing import List, Optional

from django.conf import settings
from django.contrib.auth import models as auth_models
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.postgres.fields import ArrayField
from django.core import mail, validators
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import capfirst, slugify
from django.utils.translation import gettext_lazy as _

from lasuite.tools.email import get_domain_from_email
from timezone_field import TimeZoneField

from . import fields, utils
from .recording.enums import FileExtension

logger = getLogger(__name__)


class RoleChoices(models.TextChoices):
    """Role choices."""

    MEMBER = "member", _("Member")
    ADMIN = "administrator", _("Administrator")
    OWNER = "owner", _("Owner")

    @classmethod
    def check_administrator_role(cls, role):
        """Check if a role is administrator."""
        return role == cls.ADMIN

    @classmethod
    def check_owner_role(cls, role):
        """Check if a role is owner."""
        return role == cls.OWNER


class RecordingStatusChoices(models.TextChoices):
    """Enumeration of possible states for a recording operation."""

    INITIATED = "initiated", _("Initiated")
    ACTIVE = "active", _("Active")
    STOPPED = "stopped", _("Stopped")
    SAVED = "saved", _("Saved")
    ABORTED = "aborted", _("Aborted")
    FAILED_TO_START = "failed_to_start", _("Failed to Start")
    FAILED_TO_STOP = "failed_to_stop", _("Failed to Stop")
    NOTIFICATION_SUCCEEDED = "notification_succeeded", _("Notification succeeded")

    @classmethod
    def is_final(cls, status):
        """Determine if the recording status represents a final state.

        A final status indicates the recording flow has completed, either
        successfully or unsuccessfully.
        """

        return status in {
            cls.STOPPED,
            cls.SAVED,
            cls.ABORTED,
            cls.FAILED_TO_START,
            cls.FAILED_TO_STOP,
        }

    @classmethod
    def is_unsuccessful(cls, status):
        """Determine if the recording status represents an unsuccessful state."""
        return status in {cls.ABORTED, cls.FAILED_TO_START, cls.FAILED_TO_STOP}


class RecordingModeChoices(models.TextChoices):
    """Recording mode choices."""

    SCREEN_RECORDING = "screen_recording", _("SCREEN_RECORDING")
    TRANSCRIPT = "transcript", _("TRANSCRIPT")


class RoomAccessLevel(models.TextChoices):
    """Room access level choices."""

    PUBLIC = "public", _("Public Access")
    TRUSTED = "trusted", _("Trusted Access")
    RESTRICTED = "restricted", _("Restricted Access")


class BaseModel(models.Model):
    """
    Serves as an abstract base model for other models, ensuring that records are validated
    before saving as Django doesn't do it by default.

    Includes fields common to all models: a UUID primary key and creation/update timestamps.
    """

    id = models.UUIDField(
        verbose_name=_("id"),
        help_text=_("primary key for the record as UUID"),
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    created_at = models.DateTimeField(
        verbose_name=_("created on"),
        help_text=_("date and time at which a record was created"),
        auto_now_add=True,
        editable=False,
    )
    updated_at = models.DateTimeField(
        verbose_name=_("updated on"),
        help_text=_("date and time at which a record was last updated"),
        auto_now=True,
        editable=False,
    )

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        """Call `full_clean` before saving."""
        self.full_clean()
        super().save(*args, **kwargs)


class User(AbstractBaseUser, BaseModel, auth_models.PermissionsMixin):
    """User model to work with OIDC only authentication."""

    sub_validator = validators.RegexValidator(
        regex=r"^[\w.@+-]+\Z",
        message=_(
            "Enter a valid sub. This value may contain only letters, "
            "numbers, and @/./+/-/_ characters."
        ),
    )

    sub = models.CharField(
        _("sub"),
        help_text=_(
            "Required. 255 characters or fewer. Letters, numbers, and @/./+/-/_ characters only."
        ),
        max_length=255,
        unique=True,
        validators=[sub_validator],
        blank=True,
        null=True,
    )
    email = models.EmailField(_("identity email address"), blank=True, null=True)

    # Unlike the "email" field which stores the email coming from the OIDC token, this field
    # stores the email used by staff users to log in to the admin site
    admin_email = models.EmailField(
        _("admin email address"), unique=True, blank=True, null=True
    )
    full_name = models.CharField(_("full name"), max_length=100, null=True, blank=True)
    short_name = models.CharField(
        _("short name"), max_length=100, null=True, blank=True
    )
    language = models.CharField(
        max_length=10,
        choices=settings.LANGUAGES,
        default=settings.LANGUAGE_CODE,
        verbose_name=_("language"),
        help_text=_("The language in which the user wants to see the interface."),
    )
    timezone = TimeZoneField(
        choices_display="WITH_GMT_OFFSET",
        use_pytz=False,
        default=settings.TIME_ZONE,
        help_text=_("The timezone in which the user wants to see times."),
    )
    is_device = models.BooleanField(
        _("device"),
        default=False,
        help_text=_("Whether the user is a device or a real user."),
    )
    is_staff = models.BooleanField(
        _("staff status"),
        default=False,
        help_text=_("Whether the user can log into this admin site."),
    )
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_(
            "Whether this user should be treated as active. "
            "Unselect this instead of deleting accounts."
        ),
    )

    objects = auth_models.UserManager()

    USERNAME_FIELD = "admin_email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "meet_user"
        ordering = ("-created_at",)
        verbose_name = _("user")
        verbose_name_plural = _("users")

    def __str__(self):
        return self.email or self.admin_email or str(self.id)

    def email_user(self, subject, message, from_email=None, **kwargs):
        """Email this user."""
        if not self.email:
            raise ValueError("User has no email address.")
        mail.send_mail(subject, message, from_email, [self.email], **kwargs)

    def get_teams(self):
        """
        Get list of teams in which the user is, as a list of strings.
        Must be cached if retrieved remotely.
        """
        return []


def get_resource_roles(resource: models.Model, user: User) -> List[str]:
    """
    Get all roles assigned to a user for a specific resource, including team-based roles.

    Args:
        resource: The resource to check permissions for
        user: The user to get roles for

    Returns:
        List of role strings assigned to the user
    """
    if not user.is_authenticated:
        return []

    # Use pre-annotated roles if available from viewset optimization
    if hasattr(resource, "user_roles"):
        return resource.user_roles or []

    try:
        return list(
            resource.accesses.filter_user(user)
            .values_list("role", flat=True)
            .distinct()
        )
    except (IndexError, models.ObjectDoesNotExist):
        return []


class Resource(BaseModel):
    """Model to define access control"""

    users = models.ManyToManyField(
        User,
        through="ResourceAccess",
        through_fields=("resource", "user"),
        related_name="resources",
    )

    class Meta:
        db_table = "meet_resource"
        verbose_name = _("Resource")
        verbose_name_plural = _("Resources")

    def __str__(self):
        try:
            return self.name
        except AttributeError:
            return f"Resource {self.id!s}"

    def get_role(self, user):
        """
        Determine the role of a given user in this resource.
        """
        if not user or not user.is_authenticated:
            return None

        role = None
        for access in self.accesses.filter(user=user):
            if access.role == RoleChoices.OWNER:
                return RoleChoices.OWNER
            if access.role == RoleChoices.ADMIN:
                role = RoleChoices.ADMIN
            if access.role == RoleChoices.MEMBER and role != RoleChoices.ADMIN:
                role = RoleChoices.MEMBER
        return role

    def is_administrator_or_owner(self, user):
        """
        Check if a user is administrator or owner of the resource."""
        role = self.get_role(user)
        return RoleChoices.check_administrator_role(
            role
        ) or RoleChoices.check_owner_role(role)

    def is_owner(self, user):
        """Check if a user is owner of the resource."""
        return RoleChoices.check_owner_role(self.get_role(user))

    def get_access_abilities(self, access, user):
        """
        Compute and return abilities for a given user accessing a specific access object,
        taking into account the current state of the resource and access.
        """

        roles = get_resource_roles(self, user)

        is_owner = RoleChoices.OWNER in roles
        has_privileges = is_owner or RoleChoices.ADMIN in roles

        # Default values for unprivileged users
        set_role_to = set()
        can_delete = False

        # Special handling when modifying an owner's access
        if access.role == RoleChoices.OWNER:
            # Prevent orphaning the resource
            can_delete = (
                is_owner
                and self.accesses.filter(role=RoleChoices.OWNER).count() > 1
            )
            if can_delete:
                set_role_to = {RoleChoices.ADMIN, RoleChoices.OWNER, RoleChoices.MEMBER}
        elif has_privileges:
            can_delete = True
            set_role_to = {RoleChoices.ADMIN, RoleChoices.MEMBER}
            if is_owner:
                set_role_to.add(RoleChoices.OWNER)

        # Remove the current role as we don't want to propose it as an option
        set_role_to.discard(access.role)

        return {
            "destroy": can_delete,
            "update": bool(set_role_to),
            "partial_update": bool(set_role_to),
            "retrieve": bool(roles),
            "set_role_to": sorted(r.value for r in set_role_to),
        }


class ResourceAccess(BaseModel):
    """Link table between resources and users"""

    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="accesses",
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="accesses")
    role = models.CharField(
        max_length=20, choices=RoleChoices.choices, default=RoleChoices.MEMBER
    )

    class Meta:
        db_table = "meet_resource_access"
        ordering = ("-created_at",)
        verbose_name = _("Resource access")
        verbose_name_plural = _("Resource accesses")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "resource"],
                name="resource_access_unique_user_resource",
                violation_error_message=_(
                    "Resource access with this User and Resource already exists."
                ),
            ),
        ]

    def __str__(self):
        role = capfirst(self.get_role_display())
        try:
            resource = self.resource.name
        except AttributeError:
            resource = f"resource {self.resource_id!s}"

        return f"{role:s} role for {self.user!s} on {resource:s}"

    def save(self, *args, **kwargs):
        """Make sure we keep at least one owner for the resource."""
        if self.pk and self.role != RoleChoices.OWNER:
            accesses = self._meta.model.objects.filter(
                resource=self.resource, role=RoleChoices.OWNER
            ).only("pk")
            if len(accesses) == 1 and accesses[0].pk == self.pk:
                raise PermissionDenied("A resource should keep at least one owner.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Disallow deleting the last of the Mohicans."""
        if (
            self.role == RoleChoices.OWNER
            and self._meta.model.objects.filter(
                resource=self.resource, role=RoleChoices.OWNER
            ).count()
            == 1
        ):
            raise PermissionDenied("A resource should keep at least one owner.")
        return super().delete(*args, **kwargs)


class Room(Resource):
    """Model for one room"""

    name = models.CharField(max_length=500)
    resource = models.OneToOneField(
        Resource,
        on_delete=models.CASCADE,
        parent_link=True,
        primary_key=True,
    )
    slug = models.SlugField(max_length=100, blank=True, null=True, unique=True)
    access_level = models.CharField(
        max_length=50,
        choices=RoomAccessLevel.choices,
        default=settings.RESOURCE_DEFAULT_ACCESS_LEVEL,
    )
    configuration = models.JSONField(
        blank=True,
        default=dict,
        verbose_name=_("Visio room configuration"),
        help_text=_("Values for Visio parameters to configure the room."),
    )
    pin_code = models.CharField(
        max_length=None,
        unique=True,
        blank=True,
        null=True,
        verbose_name=_("Room PIN code"),
        help_text=_("Unique n-digit code that identifies this room in telephony mode."),
    )

    class Meta:
        db_table = "meet_room"
        ordering = ("name",)
        verbose_name = _("Room")
        verbose_name_plural = _("Rooms")

    def __str__(self):
        return capfirst(self.name)

    def save(self, *args, **kwargs):
        """Generate a unique n-digit pin code for new rooms."""
        if settings.ROOM_TELEPHONY_ENABLED and not self.pk and not self.pin_code:
            self.pin_code = self.generate_unique_pin_code(
                length=settings.ROOM_TELEPHONY_PIN_LENGTH
            )
        super().save(*args, **kwargs)

    def clean_fields(self, exclude=None):
        """
        Automatically generate the slug from the name and make sure it does not look like a UUID.

        We don't want any overlapping between the `slug` and the `id` fields because they can
        both be used to get a room detail view on the API.
        """
        self.slug = slugify(self.name)
        try:
            uuid.UUID(self.slug)
        except ValueError:
            pass
        else:
            raise ValidationError({"name": f'Room name "{self.name:s}" is reserved.'})

        super().clean_fields(exclude=exclude)

    @property
    def is_public(self):
        """Check if a room is public"""
        return self.access_level == RoomAccessLevel.PUBLIC

    @staticmethod
    def generate_unique_pin_code(length):
        """Generate a unique n-digit PIN code"""

        if length < 4:
            raise ValueError(
                "PIN code length must be at least 4 digits for minimal security"
            )

        max_value = 10**length

        for _ in range(settings.ROOM_TELEPHONY_PIN_MAX_RETRIES):
            pin_code = str(secrets.randbelow(max_value)).zfill(length)
            if not Room.objects.filter(pin_code=pin_code).exists():
                return pin_code

        # Log a warning as a temporary measure until backend observability is implemented.
        logger.warning(
            "Failed to generate unique PIN code of length %s after %s attempts",
            length,
            settings.ROOM_TELEPHONY_PIN_MAX_RETRIES,
        )

        return None


class BaseAccessManager(models.Manager):
    """Base manager for handling resource access control."""

    def filter_user(self, user):
        """Filter accesses for a given user, including both direct and team-based access."""
        return self.filter(models.Q(user=user) | models.Q(team__in=user.get_teams()))


class BaseAccess(BaseModel):
    """Base model for accesses to handle resources."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    team = models.CharField(max_length=100, blank=True)
    role = models.CharField(
        max_length=20, choices=RoleChoices.choices, default=RoleChoices.MEMBER
    )

    objects = BaseAccessManager()

    class Meta:
        abstract = True

    def _get_abilities(self, resource, user):
        """
        Compute and return abilities for a given user taking into account
        the current state of the object.
        
        Delegates to resource.get_access_abilities to avoid feature envy.
        """
        return resource.get_access_abilities(self, user)


class Recording(BaseModel):
    """Model for recordings that take place in a room.

     Recording Status Flow:
    1. INITIATED: Initial state when recording is requested
    2. ACTIVE: Recording is currently in progress
    3. STOPPED: Recording has been stopped by user/system
    4. SAVED: Recording has been successfully processed and stored
    4. NOTIFICATION_SUCCEEDED: External service has been notified of this recording

    Error States:
    - FAILED_TO_START: Worker failed to initialize recording
    - FAILED_TO_STOP: Worker failed during stop operation
    - ABORTED: Recording was terminated before completion

    Warning: Worker failures may lead to database inconsistency between the actual
    recording state and its status in the database.
    """

    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="recordings",
        verbose_name=_("Room"),
    )
    status = models.CharField(
        max_length=50,
        choices=RecordingStatusChoices.choices,
        default=RecordingStatusChoices.INITIATED,
    )
    worker_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        verbose_name=_("Worker ID"),
        help_text=_(
            "Enter an identifier for the worker recording."
            "This ID is retained even when the worker stops, allowing for easy tracking."
        ),
    )
    mode = models.CharField(
        max_length=20,
        choices=RecordingModeChoices.choices,
        default=RecordingModeChoices.SCREEN_RECORDING,
        verbose_name=_("Recording mode"),
        help_text=_("Defines the mode of recording being called."),
    )

    class Meta:
        db_table = "meet_recording"
        ordering = ("-created_at",)
        verbose_name = _("Recording")
        verbose_name_plural = _("Recordings")
        constraints = [
            models.UniqueConstraint(
                fields=["room"],
                condition=models.Q(
                    status__in=[
                        RecordingStatusChoices.ACTIVE,
                        RecordingStatusChoices.INITIATED,
                    ]
                ),
                name="unique_initiated_or_active_recording_per_room",
            )
        ]

    def __str__(self):
        return f"Recording {self.id} ({self.status})"

    def get_abilities(self, user):
        """Compute and return abilities for a given user on the recording."""

        roles = set(get_resource_roles(self, user))

        is_owner_or_admin = bool(
            roles.intersection({RoleChoices.OWNER, RoleChoices.ADMIN})
        )

        is_final_status = RecordingStatusChoices.is_final(self.status)

        return {
            "destroy": is_owner_or_admin and is_final_status,
            "partial_update": False,
            "retrieve": is_owner_or_admin,
            "stop": is_owner_or_admin and not is_final_status,
            "update": False,
        }

    def is_savable(self) -> bool:
        """Determine if the recording can be saved based on its current status."""

        return self.status in {
            RecordingStatusChoices.ACTIVE,
            RecordingStatusChoices.STOPPED,
        }

    @property
    def is_saved(self) -> bool:
        """Check if the recording is in a saved state."""
        return self.status in {
            RecordingStatusChoices.NOTIFICATION_SUCCEEDED,
            RecordingStatusChoices.SAVED,
        }

    @property
    def extension(self):
        """Get recording extension based on its mode."""
        extensions = {
            RecordingModeChoices.TRANSCRIPT: FileExtension.OGG.value,
            RecordingModeChoices.SCREEN_RECORDING: FileExtension.MP4.value,
        }
        return extensions.get(self.mode, FileExtension.MP4.value)

    @property
    def key(self):
        """Generate the file key based on recording mode."""

        return f"{settings.RECORDING_OUTPUT_FOLDER}/{self.id}.{self.extension}"

    @property
    def expired_at(self) -> Optional[datetime]:
        """
        Calculate the expiration date based on created_at and RECORDING_EXPIRATION_DAYS.
        Returns None if no expiration is configured.

        Note: This is a naive and imperfect implementation since recordings are actually
        saved to the bucket after created_at timestamp is set. The actual expiration
        will be determined by the bucket lifecycle policy which operates on the object's
        timestamp in the storage system, not this value.
        """

        if not settings.RECORDING_EXPIRATION_DAYS:
            return None

        return self.created_at + timedelta(days=settings.RECORDING_EXPIRATION_DAYS)

    @property
    def is_expired(self) -> bool:
        """
        Determine if the recording has expired by comparing expired_at with current UTC time.
        Returns False if no expiration is configured or if expiration date is in the future.
        """
        if not self.expired_at:
            return False

        return self.expired_at < timezone.now()


class RecordingAccess(BaseAccess):
    """Relation model to give access to a recording for a user or a team with a role."""

    recording = models.ForeignKey(
        Recording,
        on_delete=models.CASCADE,
        related_name="accesses",
    )

    class Meta:
        db_table = "meet_recording_access"
        ordering = ("-created_at",)
        verbose_name = _("Recording/user relation")
        verbose_name_plural = _("Recording/user relations")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "recording"],
                condition=models.Q(user__isnull=False),  # Exclude null users
                name="unique_recording_user",
                violation_error_message=_("This user is already in this recording."),
            ),
            models.UniqueConstraint(
                fields=["team", "recording"],
                condition=models.Q(team__gt=""),  # Exclude empty string teams
                name="unique_recording_team",
                violation_error_message=_("This team is already in this recording."),
            ),
            models.CheckConstraint(
                condition=models.Q(user__isnull=False, team="")
                | models.Q(user__isnull=True, team__gt=""),
                name="check_recording_access_either_user_or_team",
                violation_error_message=_("Either user or team must be set, not both."),
            ),
        ]

    def __str__(self):
        return f"{self.user!s} is {self.role:s} in {self.recording!s}"

    def get_abilities(self, user):
        """
        Compute and return abilities for a given user on the recording access.
        """
        return self._get_abilities(self.recording, user)


class ApplicationScope(models.TextChoices):
    """Available permission scopes for application operations."""

    ROOMS_CREATE = "rooms:create", _("Create rooms")
    ROOMS_LIST = "rooms:list", _("List rooms")
    ROOMS_RETRIEVE = "rooms:retrieve", _("Retrieve room details")
    ROOMS_UPDATE = "rooms:update", _("Update rooms")
    ROOMS_DELETE = "rooms:delete", _("Delete rooms")


class Application(BaseModel):
    """External application for API authentication and authorization.

    Represents a third-party integration or automated system that accesses
    the API using OAuth2-style client credentials (client_id/client_secret).
    Supports scoped permissions and optional domain restrictions for delegation.
    """

    name = models.CharField(
        max_length=255,
        verbose_name=_("Application name"),
        help_text=_("Descriptive name for this application."),
    )
    active = models.BooleanField(default=True)
    client_id = models.CharField(
        max_length=100, unique=True, default=utils.generate_client_id
    )
    client_secret = fields.SecretField(
        max_length=255,
        blank=True,
        default=utils.generate_client_secret,
        help_text=_("Hashed on Save. Copy it now if this is a new secret."),
    )
    scopes = ArrayField(
        models.CharField(max_length=50, choices=ApplicationScope.choices),
        default=list,
        blank=True,
    )

    class Meta:
        db_table = "meet_application"
        ordering = ("-created_at",)
        verbose_name = _("Application")
        verbose_name_plural = _("Applications")

    def __str__(self):
        return f"{self.name!s}"

    def can_delegate_email(self, email):
        """Check if this application can delegate the given email."""

        if not self.allowed_domains.exists():
            return True  # No domain restrictions

        domain = get_domain_from_email(email)
        return self.allowed_domains.filter(domain__iexact=domain).exists()


class ApplicationDomain(BaseModel):
    """Domain authorized for application delegation."""

    domain = models.CharField(
        max_length=253,  # Max domain length per RFC 1035
        validators=[
            validators.DomainNameValidator(
                accept_idna=False,
                message=_("Enter a valid domain"),
            )
        ],
        verbose_name=_("Domain"),
        help_text=_("Email domain this application can act on behalf of."),
    )

    application = models.ForeignKey(
        "Application",
        on_delete=models.CASCADE,
        related_name="allowed_domains",
    )

    class Meta:
        db_table = "meet_application_domain"
        ordering = ("domain",)
        verbose_name = _("Application domain")
        verbose_name_plural = _("Application domains")
        unique_together = [("application", "domain")]

    def __str__(self):
        """Return string representation of the domain."""

        return self.domain

    def save(self, *args, **kwargs):
        """Save the domain after normalizing to lowercase."""

        self.domain = self.domain.lower().strip()
        super().save(*args, **kwargs)
