"""Wip."""

from rest_framework import permissions

from rest_framework_api_key.permissions import BaseHasAPIKey

from ..models import ServiceAccountAPIKey



class HasServiceAccountAPIKey(BaseHasAPIKey):
    model = ServiceAccountAPIKey

class IsAuthenticated(permissions.BasePermission):
    """
    Allows access only to authenticated users. Alternative method checking the presence
    of the auth token to avoid hitting the database.
    """
    def has_permission(self, request, view):
        return bool(request.auth) or request.user.is_authenticated
