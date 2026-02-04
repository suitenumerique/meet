"""Admin classes and registrations for core app."""

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import admin as auth_admin
from django.utils.translation import gettext_lazy as _

from core.recording.event import notification

from . import models


@admin.register(models.User)
class UserAdmin(auth_admin.UserAdmin):
    """Admin class for the User model"""

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "id",
                    "admin_email",
                    "password",
                )
            },
        ),
        (
            _("Personal info"),
            {
                "fields": (
                    "sub",
                    "email",
                    "full_name",
                    "short_name",
                    "language",
                    "timezone",
                )
            },
        ),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_device",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2"),
            },
        ),
    )
    list_display = (
        "id",
        "sub",
        "admin_email",
        "email",
        "full_name",
        "short_name",
        "is_active",
        "is_staff",
        "is_superuser",
        "is_device",
        "created_at",
        "updated_at",
    )
    list_filter = ("is_staff", "is_superuser", "is_device", "is_active")
    ordering = (
        "is_active",
        "-is_superuser",
        "-is_staff",
        "-is_device",
        "-updated_at",
        "full_name",
    )
    readonly_fields = (
        "id",
        "sub",
        "email",
        "full_name",
        "short_name",
        "created_at",
        "updated_at",
    )
    search_fields = ("id", "sub", "admin_email", "email", "full_name")


class ResourceAccessInline(admin.TabularInline):
    """Admin class for the room user access model"""

    model = models.ResourceAccess
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(models.Room)
class RoomAdmin(admin.ModelAdmin):
    """Room admin interface declaration."""

    inlines = (ResourceAccessInline,)
    search_fields = ["name", "slug", "=id"]
    list_display = ["name", "slug", "access_level", "get_owner", "created_at"]
    list_filter = ["access_level", "created_at"]
    readonly_fields = ["id", "created_at", "updated_at"]

    def get_queryset(self, request):
        """Optimize queries by prefetching related access and user data to avoid N+1 queries."""
        return super().get_queryset(request).prefetch_related("accesses__user")

    def get_owner(self, obj):
        """Return the owner of the room for display in the admin list."""

        owners = [
            access
            for access in obj.accesses.all()
            if access.role == models.RoleChoices.OWNER
        ]

        if not owners:
            return _("No owner")

        if len(owners) > 1:
            return _("Multiple owners")

        return str(owners[0].user)


class RecordingAccessInline(admin.TabularInline):
    """Inline admin class for recording accesses."""

    model = models.RecordingAccess
    extra = 0
    autocomplete_fields = ["user"]


@admin.action(description=_("Resend notification to external service"))
def resend_notification(modeladmin, request, queryset):  # pylint: disable=unused-argument
    """Resend notification to external service for selected recordings."""

    notification_service = notification.NotificationService()
    processed = 0
    skipped = 0
    failed = 0

    for recording in queryset:
        if recording.is_expired:
            skipped += 1
            continue

        try:
            success = notification_service.notify_external_services(recording)

            if success:
                processed += 1
            else:
                failed += 1
                modeladmin.message_user(
                    request,
                    _("Failed to notify for recording %(id)s") % {"id": recording.id},
                    level=messages.ERROR,
                )

        except Exception as e:  # noqa: BLE001 # pylint: disable=broad-except
            failed += 1
            modeladmin.message_user(
                request,
                _("Failed to notify for recording %(id)s: %(error)s")
                % {"id": recording.id, "error": str(e)},
                level=messages.ERROR,
            )

    if processed > 0:
        modeladmin.message_user(
            request,
            _("Successfully sent notifications for %(count)s recording(s).")
            % {"count": processed},
            level=messages.SUCCESS,
        )

    if skipped > 0:
        modeladmin.message_user(
            request,
            _("Skipped %(count)s expired recording(s).") % {"count": skipped},
            level=messages.WARNING,
        )


@admin.register(models.Recording)
class RecordingAdmin(admin.ModelAdmin):
    """Recording admin interface declaration."""

    inlines = (RecordingAccessInline,)
    search_fields = ["status", "=id", "worker_id", "room__slug", "=room__id"]
    list_display = (
        "id",
        "status",
        "mode",
        "room",
        "get_owner",
        "created_at",
        "worker_id",
    )
    list_filter = ["created_at"]
    list_select_related = ("room",)
    readonly_fields = (
        "id",
        "created_at",
        "options",
        "mode",
        "room",
        "status",
        "updated_at",
        "worker_id",
    )
    actions = [resend_notification]

    def get_queryset(self, request):
        """Optimize queries by prefetching related access and user data to avoid N+1 queries."""
        return super().get_queryset(request).prefetch_related("accesses__user")

    def get_owner(self, obj):
        """Return the owner of the recording for display in the admin list."""

        owners = [
            access
            for access in obj.accesses.all()
            if access.role == models.RoleChoices.OWNER
        ]

        if not owners:
            return _("No owner")

        if len(owners) > 1:
            return _("Multiple owners")

        return str(owners[0].user)


class ApplicationDomainInline(admin.TabularInline):
    """Inline admin for managing allowed domains per application."""

    model = models.ApplicationDomain
    extra = 0


class ApplicationAdminForm(forms.ModelForm):
    """Custom form for Application admin with multi-select scopes."""

    scopes = forms.MultipleChoiceField(
        choices=models.ApplicationScope.choices,
        widget=forms.CheckboxSelectMultiple,
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk and self.instance.scopes:
            self.fields["scopes"].initial = self.instance.scopes


@admin.register(models.Application)
class ApplicationAdmin(admin.ModelAdmin):
    """Admin interface for managing applications and their permissions."""

    form = ApplicationAdminForm

    list_display = ("id", "name", "client_id", "get_scopes_display")
    fields = [
        "name",
        "id",
        "created_at",
        "updated_at",
        "scopes",
        "client_id",
        "client_secret",
    ]
    readonly_fields = ["id", "created_at", "updated_at"]
    inlines = [ApplicationDomainInline]

    def get_readonly_fields(self, request, obj=None):
        """Make client_id and client_secret readonly after creation."""
        if obj:  # Editing existing object
            return self.readonly_fields + ["client_id", "client_secret"]
        return self.readonly_fields

    def get_fields(self, request, obj=None):
        """Hide client_secret after creation."""
        fields = super().get_fields(request, obj)
        if obj:
            return [f for f in fields if f != "client_secret"]
        return fields

    def get_scopes_display(self, obj):
        """Display scopes in list view."""
        if obj.scopes:
            return ", ".join(obj.scopes)
        return _("No scopes")

    get_scopes_display.short_description = _("Scopes")
