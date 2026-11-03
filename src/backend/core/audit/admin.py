"""Audit the writes performed through the Django admin.

Every ``ModelAdmin`` registered on :class:`AuditedAdminSite` emits an audit
event when an object is created, changed or deleted, and when a bulk action
runs. Django's own ``LogEntry`` keeps being written exactly as before: this
stream is additive.

Actions are named ``admin.<target>.<verb>`` where ``<target>`` is the model
name, for instance ``admin.room.update`` or ``admin.user.delete``.
Unlike the rest of the catalogue this family is templated rather than
enumerated: it follows whatever models are registered.

Only writes are audited. Browsing a change list or a change form emits
nothing.

Which field values may be recorded, and the event category, are registered
per model; see ``core.audit.registry``.
"""

import copy
import logging
from contextlib import contextmanager
from enum import StrEnum
from functools import wraps
from typing import Any

from django.contrib.admin import ModelAdmin
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission

from .actions import Action
from .emitter import log
from .enums import EventCategory, EventType, Outcome, Reason
from .registry import model_options
from .utils import render_value

ADMIN_ACCESS_ACTION = Action(
    "admin.access", category=EventCategory.WEB, types=(EventType.ACCESS,)
)
DIFF_ATTRIBUTE = "audit_admin_diff"
PENDING_DELETIONS_ATTRIBUTE = "audit_admin_pending_deletions"
DELETED_COPIES_ATTRIBUTE = "audit_admin_deleted_copies"
UNAUDITED_ACTIONS = frozenset({"delete_selected"})

SENSITIVE_FIELD_NAMES = frozenset(
    {"api_key", "client_secret", "pin_code", "secret", "sub", "token"}
)
SENSITIVE_FIELD_MARKERS = ("password", "secret", "token")

_logger = logging.getLogger(__name__)


class AdminVerb(StrEnum):
    """What was done to an object through the admin."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ACTION = "action"


_VERB_TYPES: dict[AdminVerb, list[EventType]] = {
    AdminVerb.CREATE: [EventType.CREATION],
    AdminVerb.UPDATE: [EventType.CHANGE],
    AdminVerb.DELETE: [EventType.DELETION],
    AdminVerb.ACTION: [EventType.CHANGE],
}


def is_sensitive(field_name: str) -> bool:
    """Tell whether the value of a field must never be recorded."""
    return field_name in SENSITIVE_FIELD_NAMES or any(
        marker in field_name for marker in SENSITIVE_FIELD_MARKERS
    )


def value_fields_for(model: type) -> frozenset[str]:
    """Return the fields of ``model`` whose before and after values may be recorded.

    Anything that looks like a secret is dropped from the ``admin_values`` of
    the model here, so a mistake in the registration cannot leak one.
    """
    names = model_options(model).admin_values
    return frozenset(name for name in names if not is_sensitive(name))


def category_for(model: type) -> EventCategory:
    """Return the registered category, else IAM for Django's auth models.

    Anything granting access to the product is IAM, the rest configuration.
    """
    if category := model_options(model).category:
        return category
    if model is get_user_model() or issubclass(model, (Group, Permission)):
        return EventCategory.IAM
    return EventCategory.CONFIGURATION


def types_for(model: type, verb: AdminVerb) -> list[EventType]:
    """Return the event types of ``verb`` on ``model``.

    ECS expects ``user`` or ``group`` before the verb when one was the target.
    """
    if issubclass(model, get_user_model()):
        return [EventType.USER, *_VERB_TYPES[verb]]
    if issubclass(model, Group):
        return [EventType.GROUP, *_VERB_TYPES[verb]]
    return _VERB_TYPES[verb]


def action_name(model: type, verb: AdminVerb) -> str:
    """Return the audit action for ``verb`` on ``model``."""
    return f"admin.{model._meta.model_name}.{verb}"  # noqa: SLF001


def form_diff(form, value_fields: frozenset[str]) -> dict[str, Any]:
    """Return the names of the fields a form changed, and the allowed values.

    Field names are always reported. Values are reported for allow-listed
    fields only, as ``{"from": ..., "to": ...}``.
    """
    changed = sorted(form.changed_data)
    changes = {
        name: {
            "from": render_value(form.initial.get(name)),
            "to": render_value(form.cleaned_data.get(name)),
        }
        for name in changed
        if name in value_fields
    }
    return {"changed_fields": changed, "changes": changes}


def related_diffs(formsets) -> list[tuple[Any, AdminVerb, dict[str, Any] | None]]:
    """Return one ``(object, verb, diff)`` triple per inline object touched.

    Called after ``save_related``, so the formsets already carry what they
    saved. The objects they list are the very instances their forms bound, so
    the matching form, and with it the before and after values, is found by
    identity. Deleted objects are reported through the copies ``save_formset``
    took, as deleting an instance clears its primary key.
    """
    touched = []
    for formset in formsets or ():
        forms = {id(form.instance): form for form in formset.forms}
        deleted_copies = getattr(formset, DELETED_COPIES_ATTRIBUTE, {})
        value_fields = value_fields_for(formset.model)

        def diff_of(obj, forms=forms, value_fields=value_fields):
            form = forms.get(id(obj))
            return form_diff(form, value_fields) if form is not None else None

        for obj in getattr(formset, "new_objects", ()):
            touched.append((obj, AdminVerb.CREATE, diff_of(obj)))
        for obj, _fields in getattr(formset, "changed_objects", ()):
            touched.append((obj, AdminVerb.UPDATE, diff_of(obj)))
        for obj in getattr(formset, "deleted_objects", ()):
            # A deleted inline has no meaningful diff
            touched.append((deleted_copies.get(id(obj), obj), AdminVerb.DELETE, None))
    return touched


class AuditedModelAdminMixin:
    """Emit an audit event for every write made through this ModelAdmin."""

    def construct_change_message(self, request, form, formsets, add=False):
        """Stash the structured diff for the ``log_*`` hook that follows."""
        message = super().construct_change_message(request, form, formsets, add)
        try:
            diff = {
                "own": form_diff(form, value_fields_for(self.model)),
                "related": related_diffs(formsets),
            }
        except Exception:  # pylint: disable=broad-exception-caught
            _logger.exception("Admin audit diff could not be built")
            diff = None
        setattr(request, DIFF_ATTRIBUTE, diff)
        return message

    def save_formset(self, request, form, formset, change):
        """Save the inline objects, keeping copies of those about to be deleted."""
        setattr(
            formset,
            DELETED_COPIES_ATTRIBUTE,
            {id(f.instance): copy.copy(f.instance) for f in formset.deleted_forms},
        )
        super().save_formset(request, form, formset, change)

    def log_addition(self, request, obj, message):
        """Record the creation, and that of any inline object saved with it."""
        entry = super().log_addition(request, obj, message)
        self.audit_form_write(request, AdminVerb.CREATE, obj)
        return entry

    def log_change(self, request, obj, message):
        """Record the change, and that of any inline object saved with it."""
        entry = super().log_change(request, obj, message)
        self.audit_form_write(request, AdminVerb.UPDATE, obj)
        return entry

    def log_deletions(self, request, queryset):
        """Note the objects about to be deleted.

        Django calls this before ``delete_model`` and ``delete_queryset``, in
        both the single and the bulk path. Those emit the events, once the
        deletion has succeeded or failed. Copies are kept because deleting an
        instance clears its primary key.
        """
        targets = list(queryset)
        entries = super().log_deletions(request, targets)
        setattr(
            request, PENDING_DELETIONS_ATTRIBUTE, [copy.copy(obj) for obj in targets]
        )
        return entries

    def delete_model(self, request, obj):
        """Delete the object, then record one deletion."""
        with self.auditing_deletions(request, lambda: [copy.copy(obj)]):
            super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Delete the objects, then record one deletion per object."""
        with self.auditing_deletions(request, lambda: list(queryset)):
            super().delete_queryset(request, queryset)

    @contextmanager
    def auditing_deletions(self, request, default_targets):
        """Record the deletions noted by ``log_deletions`` with their outcome.

        ``default_targets`` lists the objects when ``log_deletions`` did not
        run, as when a custom action deletes through these methods directly.
        """
        targets = getattr(request, PENDING_DELETIONS_ATTRIBUTE, None)
        setattr(request, PENDING_DELETIONS_ATTRIBUTE, None)
        if targets is None:
            targets = default_targets()
        try:
            yield
        except Exception as error:
            for obj in targets:
                self.audit_write(request, AdminVerb.DELETE, obj, error=error)
            raise
        for obj in targets:
            self.audit_write(request, AdminVerb.DELETE, obj)

    def get_actions(self, request):
        """Return the available actions, each wrapped so that running it is audited."""
        return {
            name: (self.audited_action(func, name), name, description)
            for name, (func, _name, description) in super().get_actions(request).items()
        }

    def audited_action(self, func, name):
        """Wrap an admin action so every run emits an event, success or not."""
        if name in UNAUDITED_ACTIONS:
            return func

        @wraps(func)
        def run(modeladmin, request, queryset):
            count = queryset.count()
            try:
                response = func(modeladmin, request, queryset)
            except Exception as error:
                modeladmin.audit_action(request, name, count, error=error)
                raise
            modeladmin.audit_action(request, name, count)
            return response

        return run

    def audit_form_write(self, request, verb, obj):
        """Emit the event for a form write and for the inlines saved with it."""
        diff = getattr(request, DIFF_ATTRIBUTE, None) or {}
        setattr(request, DIFF_ATTRIBUTE, None)
        self.audit_write(request, verb, obj, diff.get("own"))
        for related_obj, related_verb, related_diff in diff.get("related", ()):
            self.audit_write(request, related_verb, related_obj, related_diff)

    def audit_write(self, request, verb, obj, diff=None, *, error=None):  # pylint: disable=too-many-arguments
        """Emit one event for a write on ``obj``, a failed one if ``error`` is set."""
        model = obj.__class__
        log(
            action_name(model, verb),
            request=request,
            outcome=Outcome.SUCCESS if error is None else Outcome.FAILURE,
            reason=None if error is None else Reason.INTERNAL_ERROR,
            error=error,
            category=category_for(model),
            types=types_for(model, verb),
            target=obj,
            **(diff or {}),
        )

    def audit_action(self, request, name, count, error=None):
        """Emit one event for a bulk action run on ``count`` objects."""
        log(
            action_name(self.model, AdminVerb.ACTION),
            request=request,
            outcome=Outcome.SUCCESS if error is None else Outcome.FAILURE,
            reason=None if error is None else Reason.INTERNAL_ERROR,
            category=category_for(self.model),
            types=types_for(self.model, AdminVerb.ACTION),
            error=error,
            admin_action=name,
            count=count,
        )


def audited(admin_class: type) -> type:
    """Return ``admin_class`` with the audit mixin."""
    if issubclass(admin_class, AuditedModelAdminMixin):
        return admin_class
    return type(
        f"Audited{admin_class.__name__}",
        (AuditedModelAdminMixin, admin_class),
        {"__module__": admin_class.__module__, "__doc__": admin_class.__doc__},
    )


class AuditedAdminSite(AdminSite):
    """Admin site whose model admins all emit audit events.

    Installed through ``AdminConfig.default_site`` so that admin classes
    declared by Django itself, or by a third-party app, are covered as well as
    the project's own.
    """

    def register(self, model_or_iterable, admin_class=None, **options):
        """Register the audited flavour of the given admin class."""
        super().register(
            model_or_iterable, audited(admin_class or ModelAdmin), **options
        )

    def admin_view(self, view, cacheable=False):
        """Record when a signed-in account without staff access tries an admin view.

        Django asks ``has_permission`` several times per request, the login
        page included, so the refusal is recorded here instead: once per
        refused view. The answer is taken before the view runs, which may log
        the user out.
        """
        guarded = super().admin_view(view, cacheable)

        @wraps(guarded)
        def inner(request, *args, **kwargs):
            refused = getattr(
                request.user, "is_authenticated", False
            ) and not self.has_permission(request)
            response = guarded(request, *args, **kwargs)
            if refused:
                log(
                    ADMIN_ACCESS_ACTION,
                    outcome=Outcome.DENIED,
                    reason=Reason.PERMISSION_DENIED,
                    request=request,
                    status_code=response.status_code,
                )
            return response

        return inner
