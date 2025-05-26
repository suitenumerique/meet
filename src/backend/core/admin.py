"""Admin classes and registrations for core app."""

from django.contrib import admin
from django.contrib.auth import admin as auth_admin
from django.utils.translation import gettext_lazy as _

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
    list_display = ["name", "slug", "access_level", "created_at"]
    list_filter = ["access_level", "created_at"]
    readonly_fields = ["id", "created_at", "updated_at"]


class RecordingAccessInline(admin.TabularInline):
    """Inline admin class for recording accesses."""

    model = models.RecordingAccess
    extra = 0


@admin.register(models.Recording)
class RecordingAdmin(admin.ModelAdmin):
    """Recording admin interface declaration."""

    inlines = (RecordingAccessInline,)
    search_fields = ["status", "=id", "worker_id", "room__slug", "=room__id"]
    list_display = ("id", "status", "room", "get_owner", "created_at", "worker_id")
    list_filter = ["status", "room", "created_at"]
    readonly_fields = ["id", "created_at", "updated_at"]

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
