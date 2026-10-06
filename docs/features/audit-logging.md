# Audit logging

La Suite Meet keeps an **audit log**: a record of the notable things that happen in the product, such as a room created
through the external API, a recording started, a sign-in, or a change made in the Django admin. Every entry answers the
same questions: *who* did *what*, *to what*, *on whose behalf*, *from where*, and *did it work?*

It is written for:

- **operators and security teams** investigating an incident or watching for abuse
- **data protection officers**, who need to know who accessed or changed what
- **developers** adding a new audited action (see [For developers](#for-developers-emitting-events))

Each event is a single line of JSON written to standard output, kept apart from the application logs.
Events follow the [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs)
(ECS) 9.5.0, which most SIEMs understand out of the box.

Personal data is kept to a minimum. A person is identified by their account id, their OIDC `sub` and the domain of their
email address. Secrets, transit codes and the messages of unexpected exceptions are never recorded.

## What an event looks like

Events are written on the dedicated `audit` logger, one per line. Pretty-printed, one looks like this:

```json
{
  "@timestamp": "2026-09-15T08:41:12.345+00:00",
  "ecs": {"version": "9.5.0"},
  "data_stream": {"type": "logs", "dataset": "meet.audit", "namespace": "default"},
  "service": {"name": "meet", "environment": "production", "version": "1.34.0", "node": {"name": "meet-backend-6d8f7b9c4-x2x7q"}},
  "event": {
    "kind": "event",
    "id": "0b3f6a0e-5d1c-4f43-9a8e-2b7c1d0e4f5a",
    "action": "room.create",
    "category": ["api"],
    "type": ["creation"],
    "outcome": "success",
    "dataset": "meet.audit"
  },
  "client": {"ip": "1.2.3.4"},
  "source": {"ip": "1.2.3.4"},
  "http": {"request": {"id": "6f1c0d0e-2a8b-4c1d-9e7f-0a1b2c3d4e5f", "method": "POST"}, "response": {"status_code": 201}},
  "url": {"path": "/external-api/v1.0/rooms/"},
  "user_agent": {"original": "calendar-app/2.3"},
  "user": {"id": "beecd833-4be4-4675-b139-a196b07144a9", "domain": "gouv.fr"},
  "organization": {"id": "calendar-app"},
  "entity": {
    "target": {
      "id": "9ae54744-ae64-44f4-b094-71e137556b66",
      "sub_type": "room",
      "name": "Daily standup",
      "raw": {"slug": "daily-standup", "access_level": "trusted"}
    }
  },
  "lasuite": {
    "actor": {"type": "application", "sub": "0edebfa3-1355-4891-ae63-daf9fd37ac04"},
    "auth": {"method": "application_jwt"},
    "application": {"client_id": "calendar-app"},
    "outcome": "success"
  },
  "log": {"level": "info", "logger": "audit"}
}
```

Read it as: *the application `calendar-app`, acting on behalf of a user from `gouv.fr`, created the room "Daily standup"
from `1.2.3.4`, and it worked.*

When an action is refused, the event keeps the name of the action that was attempted, here still `room.create`. Only
the fields describing the outcome change:

```json
{
  "event": {"action": "room.create", "outcome": "failure", "type": ["creation", "denied"], "reason": "permission_denied"},
  "lasuite": {"outcome": "denied"},
  "http": {"response": {"status_code": 403}},
  "error": {"message": "..."},
  "log": {"level": "warning", "logger": "audit"}
}
```

## Key concepts

These words are used throughout this page and in the code (`core/audit/`). The *In the event* column says where to
find each one in the JSON above.

### The record

| Term | Meaning | In the event |
|---|---|---|
| **Audit Event** | One immutable record that a notable action was attempted, by whom, on what, and with what outcome. Written as a single JSON line on the Audit Log. | The whole document, identified by `event.id` |
| **Audit Log** | The stream of Audit Events. It is distinct from the application logs: a logger and a dataset of its own. | `data_stream.*`, `event.dataset` |
| **Action** | The dotted, stable name of what was attempted, such as `room.create` or `application.token.issue`. It names the attempt, not its result: a refused `room.create` is still a `room.create`. Every Action belongs to the Catalogue. | `event.action` |
| **Catalogue** | The closed list of Actions the code may emit, with their meaning and fields: see [Catalogue](#catalogue). Writes made through the Django admin are its one templated family, `admin.<target>.<verb>`. | — |
| **Details** | The fields specific to one Action, such as the scopes granted with a token or the fields a room update changed. The Catalogue lists them. | `lasuite.details.*` |

### Who acted

| Term | Meaning | In the event |
|---|---|---|
| **Actor** | Who is behind an Action. It always has an Actor Type. When a person's account is involved, the event also carries the account id, its OIDC `sub` when it has one, and its email domain. | `lasuite.actor.*`, `user.*` |
| **Actor Type** | What kind of Actor it is: `user`, `application`, `service`, `system` or `anonymous`. See [Actors](#actors). Device accounts are `user`s like any other account. | `lasuite.actor.type` |
| **Auth Method** | How the Actor proved who it is for this request: `session`, `oidc`, `password`, `application_jwt`, `client_credentials`, `addons_jwt`, `resource_server`, `livekit_token`, `shared_secret`, `none` when it did not authenticate, or `unknown`. | `lasuite.auth.method` |
| **Application** | A registered third-party integration, identified by its client id, that calls the external API on behalf of users. | `lasuite.application.client_id` |
| **Delegation** | An Application acting for one specific user, through the delegated token it obtained with `application.token.issue`. The event then names both: the Application as the Actor, and the user in `user.*`. | `lasuite.actor.type` = `application`, with `user.*` set |
| **Provisional User** | An account an Application created from an email address before that person ever signed in. It has no OIDC `sub` yet, so its account id is what links its `user.provision` event to its later `user.login`. | `event.action` = `user.provision` |
| **Machine User** | The identity of an internal service calling the backend with a shared secret: the LiveKit SIP bridge (`roomkit`), the summary service (`summary`), and the LiveKit server reporting that a recording ended (`livekit`). It is an Actor of type `service`, never an account. | `service.origin.name` |
| **Tenant** | The organisation an event belongs to: the calling Application when there is one, otherwise the Actor's email domain. | `organization.id` |

### What it was done to

| Term | Meaning | In the event |
|---|---|---|
| **Target** | The resource the Action was attempted on: a room, a recording, an access grant, an application or a user. Described by its type, its id and a few stable fields. See [Targets](#targets). | `entity.target.*` |
| **User Target** | The person the Action was *about*, when there is one: a provisioned user, the user an access grants a role to, or the account an admin edits. Not to be confused with `user.*`, the account whose authority was used. | `user.target.*` |

### How it went

| Term | Meaning | In the event |
|---|---|---|
| **Outcome** | Whether the Action succeeded (`success`), failed (`failure`), was refused (`denied`), or ended in a way the backend could not interpret (`unknown`). ECS has no `denied`: in `event.outcome`, a refusal is a `failure`. | `lasuite.outcome`, `event.outcome` |
| **Reason** | Why an Action did not succeed, from a closed list: `authentication_failed`, `permission_denied`, `rate_limited`, `validation_error`, `not_found`, `conflict`, `internal_error`. | `event.reason` |
| **Refusal** | An Action the backend would not let happen, such as a 401, 403 or 429. It is recorded under the Action that was attempted, with Outcome `denied`, never as an Action of its own. | `lasuite.outcome` = `denied` |

### Where and when

| Term | Meaning | In the event |
|---|---|---|
| **Source** | Where the request came from: the real client IP (never a proxy's), the HTTP method, the URL path and the user agent. Empty when no request is behind the event. | `client.ip`, `source.ip`, `http.request.method`, `url.path`, `user_agent.original` |
| **Request Id** | The id shared by the Audit Events and the web server access log of one HTTP request, what other tools call a trace id. The backend generates it, unless the ingress is trusted to set it. | `http.request.id` |
| **Emitter** | The backend instance that wrote the event: its name, environment, release and host (the pod, on Kubernetes). Never the caller. | `service.name`, `service.environment`, `service.version`, `service.node.name` |
| **Peer Service** | Another service of the deployment taking part in the Action: the one that called the backend, or the one the backend called. | `service.origin.name`, `service.target.name` |

### Where events go

| Term | Meaning | In the event |
|---|---|---|
| **Sink** | Where Audit Events are written: the `audit` logger, whose handler writes to `AUDIT_LOG_STREAM`, standard output by default. A log shipper takes them from there. | `log.logger` = `audit` |
| **Data Stream** | The data stream events are meant for, `logs-meet.audit-default` by default. It is what lets a shipper route audit events away from the application logs. | `data_stream.*` |

## Answering common questions

These are the fields to filter on for the questions that come up most. They work the same whatever tool you search
your logs with.

**Who created, changed or deleted this room?**
Filter on `entity.target.sub_type: room` with the room's id in `entity.target.id`, or its slug in
`entity.target.raw.slug`. `event.action` says what happened, and `user.id` or `lasuite.application.client_id` who did
it. Rooms are audited when they are handled through the external API (`room.*`) or the Django admin (`admin.room.*`).

**What has this application done?**
Filter on `lasuite.application.client_id`. To include the attempts made before its credentials were verified, such as a
wrong secret or an inactive application, also search `lasuite.details.claimed_client_id`.

**What did this person do, and what was done to their account?**
`user.id` is the account whose authority an action used, and `user.target.id` the account an action was about: search
both. To follow someone across the other La Suite products, use their OIDC `sub`, in `lasuite.actor.sub`.

**Which requests were refused, and why?**
Filter on `lasuite.outcome: denied` and group by `event.reason`. A burst of `authentication_failed` on `user.login` or
`application.token.issue` from a single `source.ip` deserves a closer look.

**What else happened during this request?**
Take its `http.request.id`. The same id is sent back in the `X-Request-ID` response header, and appears on every audit
event of the request and in the Gunicorn access log as `rid=`. The application logs do not carry it. A single request
may produce several events: an application obtaining a token for someone who never signed in produces both
`user.provision` and `application.token.issue`.

## Fields reference

Events follow the [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs) 9.5.0. Only two namespaces hold
what ECS does not define: `lasuite.*`, and `entity.target.raw.*` for the fields of a target.

| Field | Meaning |
|---|---|
| `@timestamp` | When the event was emitted: ISO 8601, in UTC, with millisecond precision |
| `data_stream.*`, `event.dataset` | `logs`, `<AUDIT_LOG_SERVICE_NAME>.audit` and `AUDIT_LOG_DATA_STREAM_NAMESPACE`: what sets the audit stream apart from the application logs |
| `service.name`, `service.environment`, `service.version`, `service.node.name` | The Emitter: `AUDIT_LOG_SERVICE_NAME`, the current environment, the release and the host name (the pod, on Kubernetes). Never the caller |
| `service.origin.name` | The internal service that called the backend, when the actor is a `service`: `roomkit`, `summary` or `livekit` |
| `service.target.name` | The service the backend called, such as `summary` for `recording.transcript.request` |
| `event.id` | Unique id of the event, so that a shipper retrying it cannot create a duplicate |
| `event.action` | What was attempted, from the [Catalogue](#catalogue) |
| `event.category`, `event.type` | The ECS classification (`api`, `authentication`, `iam`... and `creation`, `change`, `access`, `denied`, `user`...). Always a combination ECS expects, see [Classification](#classification) |
| `event.outcome` | ECS `success` or `failure` (refusals included), or `unknown` when the result was reported in terms the backend does not recognise |
| `event.reason` | Why it did not succeed: `authentication_failed`, `permission_denied`, `rate_limited`, `validation_error`, `not_found`, `conflict`, `internal_error` |
| `lasuite.outcome` | `success`, `failure`, `denied` or `unknown`: the same as `event.outcome`, with refusals kept apart |
| `lasuite.actor.type` | `user`, `application`, `service`, `system` or `anonymous`, see [Actors](#actors) |
| `lasuite.actor.sub` | The OIDC `sub` of the account in `user.*`, when it has one: the identity it shares with the other La Suite products |
| `lasuite.auth.method` | `session`, `application_jwt`, `addons_jwt`, `resource_server`, `livekit_token`, `shared_secret`, `client_credentials`, `oidc`, `password`, `none`, or `unknown` for an authentication class that is not registered. Requests served outside DRF, such as the admin and logout, report `session` when signed in |
| `lasuite.application.client_id` | The external application acting, if any. Only set once its credentials are verified |
| `user.id`, `user.domain` | The account whose authority the action used (see [Actors](#actors)): its primary key and email domain. The email address itself is never recorded |
| `user.roles` | That account's privileges when the event happened: `superuser`, `staff` |
| `user.target.id`, `user.target.domain` | The account the action was about: the target when it is a user, or the user an access grants a role to. `user.*` stays the actor |
| `organization.id` | The Tenant: the application's client id when there is one, otherwise the user's email domain |
| `entity.target.*` | The resource acted on, see [Targets](#targets) |
| `lasuite.details` | Fields specific to the action, see the [Catalogue](#catalogue) |
| `client.ip`, `source.ip` | The real client address, the same one DRF's throttles identify (see `NUM_PROXIES`) |
| `http.request.method`, `url.path` | The request as received |
| `user_agent.original` | The client's `User-Agent`, cut at 1024 characters |
| `http.request.id` | The Request Id. Also sent back as the `X-Request-ID` response header and logged by Gunicorn as `rid=`. Generated by the backend unless `REQUEST_ID_TRUST_HEADER` is set |
| `http.response.status_code` | The status of the response, for API calls and refusals |
| `error.message` | A human-readable reason for a failure |
| `error.type` | The class of an unhandled exception. Its message is left out, as it may contain personal data |
| `log.level` | `info` for a success, `warning` for failures, refusals and unknown outcomes, `error` for internal errors |

### Targets

The resource an action was performed on is described with ECS `entity.target`, the field set ECS 9.3 introduced for
"the targeted entity of an action taken". ECS still flags the `entity` fields as beta.

| Field | Meaning |
|---|---|
| `entity.target.id` | Its primary key |
| `entity.target.sub_type` | Its model: `room`, `recording`, `user`, `application`, `resourceaccess`... |
| `entity.target.type` | Its ECS entity type, when one fits: `user` for an account, `application` for an application |
| `entity.target.name` | Its name, when its model registers one |
| `entity.target.raw.*` | The other fields its model registers, such as a room's `slug` and `access_level`, or the OIDC `sub` of a user |

### Actors

`lasuite.actor.type` says *who* acted, and `user.*` *whose authority* the action used. They are not always the same: when
an application acts for a user, the actor is the application, but `user.*` is that user.

| `lasuite.actor.type` | Who | `user.*` |
|---|---|---|
| `user` | A person's account acting for itself: through a session, an OIDC or password login, an add-on token, or the LiveKit token of a known account | That account |
| `application` | A client application acting on behalf of a user. Either a Meet application, through its client credentials or its delegated token, or another La Suite application, through the resource server. `lasuite.application.client_id` names it | The delegating user |
| `service` | An internal service of the deployment, named by `service.origin.name`: the LiveKit SIP bridge (`roomkit`), the summary service (`summary`), or the LiveKit server reporting on a recording (`livekit`) | Absent |
| `system` | The backend itself, with no inbound request | Absent |
| `anonymous` | A caller that did not authenticate, or failed to | Absent |

The backend picks the actor type by applying these rules in order:

1. A client id is known, usually from the token payload: `application`.
2. There is neither a request nor an actor: `system`.
3. The caller authenticated without an account, as a Machine User: `service`.
4. The caller is an account: `user`.
5. Anything else: `anonymous`.

### Classification

`event.category` and `event.type` are only ever combined in the ways the ECS 9.5.0 `expected_event_types` allow:

- Each action declares its category, `api` by default, and its types. A type its category does not expect fails at
  import time, so a misclassified action can't ship.
- A refusal adds the `denied` type only when the category expects it. An API call becomes `["creation", "denied"]`. A
  failed login stays `["start"]`, and `event.outcome`, `event.reason` and `lasuite.outcome` show that it was refused.
- A 401 is also filed under `authentication`, as in `["api", "authentication"]`, so that it counts as a failed
  authentication.

When an audited API action raises an exception DRF does not handle, the event is still recorded before the exception
propagates: as a `failure` with reason `internal_error`, status code `500` and `error.type`.

## Catalogue

Action names are dotted and lower-case, in the form `<target>.<verb>`. They name what was *attempted*: whether it worked
is told by `event.outcome`, `lasuite.outcome` and `event.reason`, never by the name.

### Applications and delegation

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `application.token.issue` | An application asks for a delegated token (`POST /external-api/v1.0/application/token/`), whether it gets one or is refused. It can be refused for bad credentials, an inactive application, an invalid or unauthorized email domain, an unknown user, or a provisioning conflict | On success: `user.*` is the delegated user, `entity.target` the application, and `lasuite.details` holds `scopes`, `user_provisioned` and `expires_in`. On refusal: `event.reason`, `http.response.status_code` and `lasuite.details.requested_domain`. Until its credentials are verified, the client id the caller submitted is only recorded as `lasuite.details.claimed_client_id`: it never sets `lasuite.application` or `organization` |
| `user.provision` | An application creates a provisional user from an email address, or fails to. It is a `failure` with reason `conflict` when a concurrent request created the user first | `user.target` and `entity.target` are the user, the existing one on a conflict. A provisional user has no `sub` yet: its id links this event to the winning one and to its later `user.login` |

### Rooms

Rooms are audited on the external API only.

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `room.create` | A room is created through the external API, or the attempt fails | `entity.target` is the room |
| `room.update` | A room is updated through the external API, or the attempt fails | `entity.target` is the room, refusals included. `lasuite.details.updated_fields` and `previous_access_level` |
| `room.delete` | A room is deleted through the external API: soft deleted, its LiveKit room closed. Or the attempt fails | `entity.target` is the room, refusals included |
| `room.retrieve` | A room is read through the external API, or the attempt fails | `entity.target` is the room |
| `room.list` | Rooms are listed through the external API, or the attempt fails | `lasuite.details.total` |

### Recordings, transcripts and summaries

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `recording.start` | A room owner or administrator starts a recording, or the attempt fails: a recording already in progress, a worker error | `entity.target` is the recording, or the room when none was created. `lasuite.details.collect_metadata` |
| `recording.stop` | A room owner or administrator stops the recording in progress, or the attempt fails | `entity.target` is the recording, or the room when none is active |
| `recording.end` | LiveKit reports that a recording ended (`egress_ended` webhook): `success` when its media file is available, `failure` when it was aborted or failed, `unknown` for a status the backend does not map | `service.origin.name` is `livekit`. `entity.target` is the recording as it was before the report was processed. `lasuite.details.worker_event` (`completed`, `limit reached`, `aborted`, `failed`) and `error_code` |
| `recording.delete` | A recording is deleted, or the attempt fails | `entity.target` is the recording |
| `recording.transcript.request` | The backend sends a recording to the summary service to be transcribed, or fails to | `lasuite.actor.type` is `system`, `service.target.name` is `summary`, and `entity.target` is the recording. `lasuite.details.summary_requested` (whether a summary of the transcript is to be made too) and `job_id` |
| `recording.transcript.report` | The summary service reports on a transcript (`external-process-hook`), or a call to that hook is refused | `service.origin.name` is `summary`. `entity.target` is the recording, absent for an unknown job. `lasuite.details.job_id` and `status`. A failure the service reports is recorded as a `failure` |
| `recording.summary.report` | The summary service reports on a summary | Same as `recording.transcript.report` |

A recording's target says what was recorded:

- `mode` is how the media was captured: `screen_recording` for a video, `transcript` for an audio track;
- `requested_mode` is what the user asked for;
- `is_transcribed` says whether it is sent to the summary service.

`mode` and `requested_mode` differ for a transcript started with a screen capture: `mode` is then `screen_recording`,
and `requested_mode` is `transcript`.

Transcripts and summaries are not recordings, but what the summary service derives from one. They are audited under
`recording.transcript.*` and `recording.summary.*`, with the recording as their target.

### Sign-in and the admin

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `user.login` | A user signs in, or a sign-in attempt fails: `denied`, with reason `authentication_failed` | `lasuite.auth.method` is `oidc`, `password` or `unknown`. On success, it is named after the login backend, also given in `lasuite.details.auth_backend`. On failure, it is named after the credentials submitted: a password, or the nonce of the OIDC callback |
| `user.logout` | A user signs out | |
| `admin.access` | A signed-in account without staff access reaches an admin page. Always denied, once per refused page | `event.category` is `web` and `event.type` is `access`. `event.reason`, and `http.response.status_code`: the redirect to the login page |
| `admin.<target>.<verb>` | A write is made through the Django admin, see [Django admin](#django-admin) | |

## Django admin

The admin is the most sensitive part of the product, so every write made through it produces an audit event, alongside
the `LogEntry` Django already writes. Nothing is replaced and there is no extra table: the admin history keeps working.

The action name follows a template, `admin.<target>.<verb>`, where `<target>` is the model name and `<verb>` one of:

| `<verb>` | Emitted when | Notable fields |
|---|---|---|
| `create` | An object is added | `lasuite.details.changed_fields`, `changes` |
| `update` | An object is changed | `lasuite.details.changed_fields`, `changes` |
| `delete` | An object is deleted: one event per object, once the deletion has run. A deletion that raises is a `failure` with reason `internal_error`, and in a bulk deletion every selected object is then reported as failed | `error.message` on failure |
| `action` | A bulk action runs | `lasuite.details.admin_action`, `count` |

This gives names such as `admin.room.update`, `admin.user.delete` or `admin.recording.action`. `event.category` is `iam`
for anything that grants access to the product, and `configuration` otherwise. Writes on a user or a group put `user` or
`group` first in `event.type`, as in `["user", "change"]`.

### What changed

- `lasuite.details.changed_fields` always lists the **names** of the fields a form changed, exactly the ones Django
  reports in its own history.
- `lasuite.details.changes` gives their **values**, as `{"from": ..., "to": ...}`, but only for the fields a model
  explicitly allows in the `admin_values` it is registered with (see
  [Registering models](#registering-models-and-authentication-methods)).
- Anything that looks like a secret is refused, whatever the allow-list says. A password change is reported as a change
  to `password`, never with its value.
- A `JSONField` on the allow-list, such as a room's `configuration`, is recorded as JSON rather than as a string, and
  both versions are kept whole.

### Inlines

Objects edited through an **inline** produce their own event, linked to the parent's by `http.request.id`. Granting a
role on a room produces both `admin.room.update` and `admin.resourceaccess.create`, whose `user.target` is the account
granted the role.

### What is not covered

- **Reads.** Opening a change list, a change form or the history page emits nothing. Django's own `LogEntry` remains
  the record of who touched what.
- **Custom actions that bypass the ORM hooks.** An action calling `queryset.update()` or `queryset.delete()` directly
  is reported as a single `admin.<target>.action`, with its name and the number of objects, not one event per object.
  `delete_selected` is the exception: Django reports its objects through `log_deletions`, so it emits one
  `admin.<target>.delete` per object and no `action` event.

### How it is wired

The wiring lives in `core/audit/admin.py`. `AuditedAdminSite` adds auditing to every admin class when it is registered,
including those Django declares itself, and is installed through `core.audit.apps.AuditedAdminConfig` in
`INSTALLED_APPS`. A new `ModelAdmin` is therefore covered without doing anything. Registering its model (see
[Registering models](#registering-models-and-authentication-methods)) only adds its category and its allowed values.

## For developers: emitting events

### Declaring an action

Every action is declared once, in `core/auditing.py`, as an `audit.Action` constant. An action may carry its ECS
category and types, which then apply to every event it emits:

```python
APPLICATION_TOKEN_ISSUE = audit.Action(
    "application.token.issue",
    category=EventCategory.AUTHENTICATION,
    types=(EventType.START,),
)
ROOM_CREATE = audit.Action("room.create")
```

### Auditing a DRF view

A DRF view only declares the actions it audits: everything else is derived from the response. CRUD actions are mapped
in `audit_actions`. An extra action names its own on its route, so that renaming its method cannot silently stop
auditing it:

```python
from core import audit, auditing


class RoomViewSet(audit.AuditViewMixin, viewsets.GenericViewSet):
    audit_actions = {"create": auditing.ROOM_CREATE, "retrieve": auditing.ROOM_RETRIEVE}

    def perform_create(self, serializer):
        self.audit_target = serializer.save()

    @action(detail=True, methods=["post"], audit_action=auditing.ROOM_INVITE)
    def invite(self, request, pk=None): ...
```

`AuditViewMixin` fills in the rest:

- It runs from DRF's `finalize_response` hook, which every response goes through, successful or not.
- The ECS category and types come from the action, or default to `api` and the DRF action.
- The outcome, reason and status code come from the response status: 401, 403 and 429 are `denied`, other errors are
  `failure`, and a 401 is always filed under `authentication`.
- The target is the object `get_object()` returned, unless the view assigns `audit_target`.
- A view can also assign `audit_actor` (`None` records no account) and `audit_details`, or override `get_audit_fields()`.

### Auditing from anywhere else

Outside of `AuditViewMixin`, from a view or deeper in a service, call `audit.log`. A `category` or `types` given here
wins over the action's:

```python
audit.log(auditing.USER_PROVISION, target=user)
```

Without `request=`, the event reads the context of the request being served, `audit.request_context()`, which
`AuditLogMiddleware` captures when the request comes in. Outside a request, as in a Celery task, the context is empty
and the actor is the system.

> [!NOTE]
> That context holds the Django request. DRF copies its user and auth onto it, but not its authenticator, so a call
> made inside a DRF view without `request=` should pass `auth_method=`.

### How fields are filled

- **Request fields** are read from the request: the real client address, the path and the user agent.
  `http.request.id` is the request id, settled by `AuditLogMiddleware` right after dockerflow assigns it, and echoed in
  the `DOCKERFLOW_REQUEST_ID_HEADER_NAME` response header (`X-Request-ID` by default). The inbound id is only kept when
  `REQUEST_ID_TRUST_HEADER` is set. Otherwise the backend generates one, so a client never picks it.
- **The actor** is derived from `request.user`, `request.auth` and the DRF authenticator, as described in
  [Actors](#actors). The authenticator's class is mapped to an auth method by `audit.register_auth_method` (see
  [Configuration](#configuration)). Without a request, the actor is the system. You can override it with `actor=`,
  `actor_type=`, `auth_method=` and `client_id=`. An explicit `actor_type=` keeps the account the request is signed in
  as. `actor=None` records no account: for a caller failing to authenticate, an application acting before it is given
  a delegated user, or the system.
- **The target** is described by its model name, its primary key and the `fields` its model is registered with, see
  [Targets](#targets). A model that is not registered is still identified. The account the action is about,
  `user.target`, is found from the target, unless given as `user_target=`. Name a service the backend calls with
  `target_service=`. Any other keyword argument lands under `lasuite.details`.

### Emission never raises

A broken configuration or value is reported on the application logger (and to Sentry), and the business operation goes
on. A registered field that cannot be read is left out of the target, and the event is still emitted.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AUDIT_LOG_LEVEL` | `INFO` | Level of the `audit` logger |
| `AUDIT_LOG_STREAM` | `ext://sys.stdout` | Where the handler writes |
| `AUDIT_LOG_SERVICE_NAME` | `meet` | `service.name`, and the dataset `<name>.audit`, with any `-` turned into `_` |
| `AUDIT_LOG_DATA_STREAM_NAMESPACE` | `default` | `data_stream.namespace`: events are routed to the data stream `logs-meet.audit-<namespace>`. It must not contain `-` |
| `NUM_PROXIES` | `1` | DRF's number of trusted proxies appending to `X-Forwarded-For`, shared with the throttles. The client is the entry that many positions from the right; anything a client injects lands further left and is ignored. `1` matches the ingress-nginx defaults; use `2` behind a load balancer that also appends |
| `REQUEST_ID_TRUST_HEADER` | `False` | Reuse the inbound request id as `http.request.id`, so that the ingress, Gunicorn and audit events share one id. Only set it when the ingress overwrites the header (`proxy_set_header X-Request-ID $request_id;` on ingress-nginx, which otherwise forwards the client's): otherwise a client could pick the id of someone else's request |
| `DOCKERFLOW_REQUEST_ID_HEADER_NAME` | `X-Request-ID` | The header carrying that id. Read on the request only when `REQUEST_ID_TRUST_HEADER` is set, always echoed on the response |

### Registering models and authentication methods

The project describes itself to the audit facility in code, in `core/auditing.py`. Once the audit app is ready, it
imports the `auditing` module of every installed app.

**`audit.register(Model, ...)`** tells the audit log how to handle a model:

- `fields`: the fields describing it as a target;
- `admin_values`: the fields whose before and after values may be recorded for admin writes;
- `category`: the ECS category of its admin writes;
- `entity_type`: its ECS entity type, when one of the allowed values fits (`application`, `user`...);
- `user_target`: the attribute holding the account an event on it is about, such as `user` for an access.

A proxy model falls back to its concrete model. Registering a model twice raises `AlreadyRegistered`, and an entity type
ECS does not allow raises `ValueError`.

**`audit.register_auth_method(klass, name)`** sets the `lasuite.auth.method` of a DRF authentication class or of a login
backend. A DRF class inherits the name of its closest registered base, and DRF's own classes are built in. A login
backend must be registered itself, because custom backends often subclass `ModelBackend` just for its permission
checks. `ModelBackend` is built in as `password`.
