"""Admin classes and registrations for core app."""

from django import forms
from django.contrib import admin, messages
from django.contrib.auth import admin as auth_admin
from django.db import transaction
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from core.recording.event import notification

from . import models
from .tasks.file import process_file_deletion
from .utils import generate_download_s3_url


def hard_delete_file(file):
    """Hard delete a file, soft deleting it first when needed."""
    if file.deleted_at is None:
        file.soft_delete()
    file.hard_delete()
    transaction.on_commit(lambda: process_file_deletion.delay(file.id))


class FileInlineFormSet(forms.BaseInlineFormSet):
    """Inline formset overriding delete behavior for files."""

    def delete_existing(self, obj, commit=True):
        """Hard delete files instead of calling model.delete()."""
        hard_delete_file(obj)


class FileInline(admin.TabularInline):
    """Inline class for the File model."""

    model = models.File
    formset = FileInlineFormSet
    fk_name = "creator"
    extra = 0
    fields = ("id", "title", "type", "upload_state", "created_at")
    readonly_fields = ("id", "created_at", "upload_state", "type")
    show_change_link = True

    def get_queryset(self, request):
        """Hide hard deleted files in the inline."""
        return super().get_queryset(request).filter(hard_deleted_at__isnull=True)


@admin.register(models.User)
class UserAdmin(auth_admin.UserAdmin):
    """Admin class for the User model"""

    inlines = (FileInline,)

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


@admin.register(models.File)
class FileAdmin(admin.ModelAdmin):
    """Admin class for the File model."""

    list_display = (
        "id",
        "title",
        "type",
        "creator",
        "upload_state",
        "deleted_at",
        "hard_deleted_at",
        "created_at",
        "updated_at",
    )
    list_filter = (
        "type",
        "upload_state",
        "created_at",
        "updated_at",
        "deleted_at",
        "hard_deleted_at",
    )
    search_fields = (
        "id",
        "title",
        "filename",
        "mimetype",
        "description",
        "creator__email",
        "creator__admin_email",
        "creator__full_name",
    )
    ordering = ("-created_at",)
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "deleted_at",
        "hard_deleted_at",
        "description",
        "malware_detection_info",
        "is_ready",
        "preview_url",
        "extension",
        "key_base",
        "file_key",
        "upload_state",
        "type",
        "mimetype",
        "size",
    )
    autocomplete_fields = ("creator",)
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "id",
                    "title",
                    "type",
                    "creator",
                    "filename",
                    "upload_state",
                )
            },
        ),
        (
            _("Content"),
            {
                "fields": (
                    "mimetype",
                    "size",
                    "description",
                    "malware_detection_info",
                )
            },
        ),
        (
            _("Deletion"),
            {
                "fields": (
                    "deleted_at",
                    "hard_deleted_at",
                )
            },
        ),
        (
            _("Derived info"),
            {
                "fields": (
                    "is_ready",
                    "extension",
                    "key_base",
                    "file_key",
                    "preview_url",
                )
            },
        ),
        (_("Timestamps"), {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description=_("File preview"))
    def preview_url(self, obj):
        """Return a clickable preview URL for the file."""
        if not obj.is_ready:
            return "-"
        url = generate_download_s3_url(obj.key, expires_in=60 * 60)

        return format_html(
            '<a href="{}" target="_blank" rel="noopener noreferrer">Open File</a>', url
        )

    def get_queryset(self, request):
        """Hide hard deleted files in admin listing and lookups."""
        return super().get_queryset(request).filter(hard_deleted_at__isnull=True)

    def delete_model(self, request, obj):
        """Hard delete instead of calling model.delete()."""
        hard_delete_file(obj)

    def delete_queryset(self, request, queryset):
        """Hard delete all selected files."""
        for file in queryset:
            hard_delete_file(file)

    def has_add_permission(self, request):
        return False


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


@admin.action(description=_("Mark selected recordings as 'Failed to Stop'"))
def mark_as_failed_to_stop(modeladmin, request, queryset):
    """Force selected recordings status to failed_to_stop."""

    eligible_statuses = [
        models.RecordingStatusChoices.ACTIVE,
        models.RecordingStatusChoices.INITIATED,
        models.RecordingStatusChoices.STOPPED,
    ]

    eligible = queryset.filter(status__in=eligible_statuses)
    skipped = queryset.exclude(status__in=eligible_statuses).count()

    updated = eligible.update(status=models.RecordingStatusChoices.FAILED_TO_STOP)

    if updated > 0:
        modeladmin.message_user(
            request,
            _("%(count)s recording(s) successfully marked as 'Failed to Stop'.")
            % {"count": updated},
            level=messages.SUCCESS,
        )

    if skipped > 0:
        modeladmin.message_user(
            request,
            _("Skipped %(count)s recording(s) with an ineligible status.")
            % {"count": skipped},
            level=messages.WARNING,
        )


@admin.register(models.Recording)
class RecordingAdmin(admin.ModelAdmin):
    """Recording admin interface declaration."""

    inlines = (RecordingAccessInline,)
    search_fields = [
        "status",
        "=id",
        "worker_id",
        "room__slug",
        "=room__id",
        "accesses__user__email",
    ]
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
    actions = [resend_notification, mark_as_failed_to_stop]

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

    list_display = ("id", "name", "client_id", "get_scopes_display", "is_active")
    fields = [
        "name",
        "id",
        "created_at",
        "updated_at",
        "scopes",
        "client_id",
        "client_secret",
        "is_active",
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
