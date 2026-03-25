"""API filters for meet' core application."""

from django.utils.translation import gettext_lazy as _

import django_filters
from django_filters import BooleanFilter

from core import models


class FileFilter(django_filters.FilterSet):
    """
    Custom filter for filtering files.
    """

    class Meta:
        model = models.File
        fields = ["type"]


class ListFileFilter(FileFilter):
    """Filter class dedicated to the file viewset list method."""

    is_creator_me = django_filters.BooleanFilter(
        method="filter_is_creator_me", label=_("Creator is me")
    )

    is_deleted = BooleanFilter(field_name="deleted_at", method="filter_is_deleted")

    class Meta:
        model = models.File
        fields = ["is_creator_me", "type", "upload_state", "is_deleted"]

    def filter_is_deleted(self, queryset, name, value):
        """
        Filter files based on whether they are deleted or not.

        Example:
            - /api/v1.0/files/?is_deleted=false
                → Filters files that were not deleted
        """
        if value is None:
            return queryset

        lookup = "__".join([name, "isnull"])
        return queryset.filter(**{lookup: not value})

    # pylint: disable=unused-argument
    def filter_is_creator_me(self, queryset, name, value):
        """
        Filter files based on the `creator` being the current user.

        Example:
            - /api/v1.0/files/?is_creator_me=true
                → Filters files created by the logged-in user
            - /api/v1.0/files/?is_creator_me=false
                → Filters files created by other users
        """
        user = self.request.user

        if not user.is_authenticated:
            return queryset

        if value:
            return queryset.filter(creator=user)

        return queryset.exclude(creator=user)
