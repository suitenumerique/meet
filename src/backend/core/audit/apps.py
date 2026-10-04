"""Application configurations of the audit facility."""

from django.apps import AppConfig
from django.utils.module_loading import autodiscover_modules

from .signals import connect_auth_signals


class AuditConfig(AppConfig):
    """Audit Django's authentication signals and load the project's declarations."""

    name = "core.audit"
    label = "audit"

    def ready(self):
        """Connect the login, failed login and logout receivers.

        Then import the ``auditing`` module of every installed app, where the
        project registers its models and authentication classes.
        """
        connect_auth_signals()
        autodiscover_modules("auditing")
