# Audit logging

La Suite Meet emits a structured **audit log**: one JSON line per notable action, saying who did what, on behalf of
whom, on which resource, from where, and whether it succeeded.

## What an event looks like

Events are written on the dedicated `audit` logger, one per line and look like this::

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

A refusal is recorded under the action that was attempted: the same `room.create`, with
`"event": {"outcome": "failure", "type": ["creation", "denied"], "reason": "permission_denied"}`,
`"lasuite": {"outcome": "denied"}`, `"http": {"response": {"status_code": 403}}` and `"error": {"message": "..."}`.

## Fields

Events follow the [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs) 9.5.0. Only two namespaces
hold what ECS does not define: `lasuite.*`, and `entity.target.raw.*` for the fields of a target.

| Field | Meaning |
|---|---|
| `@timestamp` | ISO 8601 with millisecond precision in UTC timezone |
| `data_stream.*`, `event.dataset` | `logs`, `<AUDIT_LOG_SERVICE_NAME>.audit` and `AUDIT_LOG_DATA_STREAM_NAMESPACE`: what tells the audit stream apart from the application logs |
| `service.name`, `service.environment`, `service.version`, `service.node.name` | `AUDIT_LOG_SERVICE_NAME`, current environment, release and host name (the pod on Kubernetes): the emitter, never the caller |
| `service.origin.name` | The internal peer that called the backend, when the actor is a `service`: `roomkit`, `summary` |
| `service.target.name` | The peer service the backend called, when one is named |
| `event.id` | Unique id of the event, so that a shipper retrying it cannot duplicate it |
| `event.action` | What was attempted, from the catalogue below |
| `event.category`, `event.type` | ECS classification (`api`, `authentication`, `iam`... / `creation`, `change`, `access`, `denied`, `user`...). Always a combination ECS expects, see [Classification](#classification) |
| `event.outcome` | ECS `success`, `failure`, or `unknown` when the result was reported in terms the backend does not recognise |
| `event.reason` | Why it did not succeed: `authentication_failed`, `permission_denied`, `rate_limited`, `validation_error`, `not_found`, `conflict`, `internal_error` |
| `lasuite.outcome` | `success`, `failure`, `denied` or `unknown` |
| `lasuite.actor.type` | `user`, `application`, `service`, `system` or `anonymous`, see [Actors](#actors) |
| `lasuite.actor.sub` | OIDC sub of the account in `user.*`, when it has one: the identity it shares with the other La Suite products |
| `lasuite.auth.method` | `session`, `application_jwt`, `addons_jwt`, `resource_server`, `livekit_token`, `shared_secret`, `client_credentials`, `oidc`, `password`, `none`, or `unknown` for a class that is not registered. Requests served outside DRF, as the admin and logout are, report `session` when signed in |
| `lasuite.application.client_id` | The external application acting, when there is one. Only set once its credentials are verified |
| `user.id`, `user.domain` | The account whose authority the action used, see [Actors](#actors): primary key and email domain. The email address is never recorded |
| `user.roles` | Its privileges at the time of the event: `superuser`, `staff` |
| `user.target.id`, `user.target.domain` | The account the action was about: the target when it is a user, or the user an access grants a role to. `user.*` stays the actor |
| `organization.id` | Tenant: the application client id when present, else the user's email domain |
| `entity.target.*` | The resource acted on, see [Targets](#targets) |
| `lasuite.details` | Action-specific fields (see catalogue) |
| `client.ip`, `source.ip` | Real client address, the one DRF's throttles identify (see `NUM_PROXIES`) |
| `http.request.method`, `url.path` | Request as received |
| `user_agent.original` | The client's `User-Agent`, cut at 1024 characters |
| `http.request.id` | Request id, also echoed as the `X-Request-ID` response header and logged by Gunicorn as `rid=`. Generated by the backend unless `REQUEST_ID_TRUST_HEADER` is set |
| `http.response.status_code` | Status of the response, for API calls and refusals |
| `error.message` | Human-readable reason of a failure |
| `error.type` | Class of an unhandled exception. Its message is left out, as it may carry personal data |
| `log.level` | `info` for success, `warning` for failures, denials and unknown outcomes, `error` for internal errors |

### Targets

The resource an action was performed on is described as an ECS `entity.target`, the field set ECS 9.3 introduced for
"the targeted entity of an action taken":

| Field | Meaning |
|---|---|
| `entity.target.id` | Its primary key |
| `entity.target.sub_type` | Its model: `room`, `recording`, `user`, `application`, `resourceaccess`... |
| `entity.target.type` | Its ECS entity type, when one fits: `user` for an account, `application` for an application |
| `entity.target.name` | Its name, when its model registers one |
| `entity.target.raw.*` | The other fields its model registers, as a room's `slug` and `access_level`, and the OIDC `sub` of a user |

ECS still flags the `entity` fields as beta.

### Classification

`event.category` and `event.type` only ever combine as the ECS 9.5.0 `expected_event_types` allow:

- An action declares its category, `api` by default, and its types. A type the category does not expect fails at import.
- A refusal adds `denied` only to a category expecting it: an API call is `["creation", "denied"]`, a failed login
  stays `["start"]`, its refusal told by `event.outcome`, `event.reason` and `lasuite.outcome`.
- A 401 is also filed under `authentication`, as in `["api", "authentication"]`, so that it counts as a failed
  authentication.

An audited API action that raises an exception DRF does not handle is still recorded, as a `failure` with reason
`internal_error`, status code `500` and `error.type`, before the exception propagates.

### Actors

`lasuite.actor.type` says who acted, and `user.*` whose authority the action used:

| `lasuite.actor.type` | Who | `user.*` |
|---|---|---|
| `user` | A person's account acting for itself: session, OIDC or password login, add-on token, LiveKit token of a known account | That account |
| `application` | A client application acting on behalf of a user: a Meet application through its client credentials or its delegated token, or another La Suite application through the resource server. `lasuite.application.client_id` names it | The delegating user |
| `service` | An internal peer of the deployment acting on its own behalf, named by `service.origin.name`: the LiveKit SIP bridge (`roomkit`), the summary service (`summary`). | Absent |
| `system` | The backend itself, with no inbound request | Absent |
| `anonymous` | A caller that did not authenticate, or failed to | Absent |

A `client_id` in the token payload makes an application, a principal authenticated without an account a service, and
an account a user. An event emitted with neither a request nor an actor is the system's.

## Catalogue

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `application.token.issue` | An application requests a delegated token (`POST /external-api/v1.0/application/token/`), whether it obtains one or is refused: bad credentials, inactive application, invalid or unauthorized email domain, unknown user, provisioning conflict | On success: `user.*` = delegated user, `entity.target` = application, `lasuite.details.scopes`, `user_provisioned`, `expires_in`. On refusal: `event.reason`, `http.response.status_code`, `lasuite.details.requested_domain`. Until the credentials are verified, the submitted client id is only `lasuite.details.claimed_client_id`: it never sets `lasuite.application` or `organization` |
| `user.provision` | An application creates a provisional user by email, or fails to: `failure` with reason `conflict` when a concurrent request created it first | `user.target` and `entity.target` = user, the existing one on a conflict. A provisional user has no `sub` yet: its id joins this event to the winning one and to its later `user.login` |
| `room.create` | A room is created through the external API, or the attempt fails | `entity.target` = room |
| `room.update` | A room is updated through the external API, or the attempt fails | `entity.target` = room, refusals included, `lasuite.details.updated_fields`, `previous_access_level` |
| `room.retrieve` | A room is read through the external API, or the attempt fails | `entity.target` = room |
| `room.list` | Rooms are listed through the external API, or the attempt fails | `lasuite.details.total` |
| `user.login` | A user logs in or a login attempt fails, `denied` with reason `authentication_failed` | `lasuite.auth.method` = `oidc` or `password`, or `unknown`: named after the backend on success, `lasuite.details.auth_backend`, and after the credentials submitted on failure (a password, or the nonce of the OIDC callback) |
| `user.logout` | A user logs out | |
| `admin.access` | A signed-in account without staff access reaches an admin page (always denied), once per refused page | `event.category` = `web`, `event.type` = `access`, `event.reason`, `http.response.status_code`: the redirect to the login page |
| `admin.<target>.<verb>` | A write is made through the Django admin, see below | |

Actions are always dotted, lower-case, with the format `<target>.<verb>`, and name what was attempted: whether it
succeeded is told by `event.outcome`, `lasuite.outcome` and `event.reason`, never by the action.

## Django admin

The admin is the most sensitive surface of the product, so every write made through it emits an audit event next to
the `LogEntry` Django writes itself. Nothing is replaced and there is no extra table: the admin history keeps working.

The action is templated rather than listed: `admin.<target>.<verb>`, where `<target>` is the model name and `<verb>`
one of:

| `<verb>` | Emitted when | Notable fields |
|---|---|---|
| `create` | An object is added | `lasuite.details.changed_fields`, `changes` |
| `update` | An object is changed | `lasuite.details.changed_fields`, `changes` |
| `delete` | An object is deleted, one event per object, once the deletion has run. A deletion that raises is a `failure` with reason `internal_error`; in a bulk deletion every selected object is then reported as failed | `error.message` on failure |
| `action` | A bulk action runs | `lasuite.details.admin_action`, `count` |

So `admin.room.update`, `admin.user.delete`, `admin.recording.action`. `event.category` is `iam` for anything granting
access to the product and `configuration` otherwise. Writes on a user or a group lead `event.type` with `user` or
`group`, as in `["user", "change"]`.

`lasuite.details.changed_fields` always carries the **names** of the fields a form changed, exactly the ones Django
reports in its own history. `lasuite.details.changes` carries their **values**, as `{"from": ..., "to": ...}`, and only
for the fields a model explicitly allows in the `admin_values` it is registered with. Anything that
looks like a secret is refused there whatever the allow-list says, so a password change is reported as a change to `password` and never with its value.
A `JSONField` on the allow-list, such as a room's `configuration`, is recorded as JSON rather than stringified, and both versions are kept
whole.

Objects edited through an **inline** emit their own event, joined to the parent's by `http.request.id`: granting a role
on a room produces both `admin.room.update` and `admin.resourceaccess.create`, whose `user.target` is the account
granted the role.

What is deliberately **not** covered:

- **Reads.** Opening a change list, a change form or the history page emits nothing. Django's own `LogEntry` remains
  the record of who touched what.
- **A custom action bypassing the ORM hooks.** An action calling `queryset.update()` or `queryset.delete()` directly
  is reported as `admin.<target>.action` with its name and the number of objects, not one event per object.
  `delete_selected` is the exception: Django reports its objects through `log_deletions`, so it emits one
  `admin.<target>.delete` each and no `action` event.

The wiring lives in `core/audit/admin.py`: `AuditedAdminSite` mixes the auditing into every admin class at
registration, including those declared by Django itself, and is installed through
`core.audit.apps.AuditedAdminConfig` in `INSTALLED_APPS`. A new `ModelAdmin` is therefore covered without doing
anything; registering its model (see below) only adds its category and its allowed values.

## Emitting events

Actions are declared once, in `core/auditing.py`, as `audit.Action` constants. An action may carry its ECS category
and types, which then apply to every event it emits:

```python
APPLICATION_TOKEN_ISSUE = audit.Action(
    "application.token.issue",
    category=EventCategory.AUTHENTICATION,
    types=(EventType.START,),
)
ROOM_CREATE = audit.Action("room.create")
```

DRF views declare the actions they audit; everything else is derived from the response. CRUD actions are mapped in
`audit_actions`, and an extra action names its own on its route, so that renaming its method cannot silently stop
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

- **Views are audited by `AuditViewMixin`** from DRF's `finalize_response` hook, which runs for every response,
successful or not. The ECS category and types come from the action, else `api` and the DRF action.
The outcome, reason and status code come from the response status: 401, 403 and 429 are `denied`, other
errors `failure`, and a 401 is always filed under `authentication`. The target is the object `get_object()` returned,
unless the view assigns `audit_target`. A view can also assign `audit_actor`, `None` recording no account, and
`audit_details`, or override `get_audit_fields()`.

- **Anything else calls `audit.log`**, from a view or deeper, as a service. Without `request=`, the event reads the
context of the request being served, `audit.request_context()`, which `AuditLogMiddleware` captures when the request
comes in. Outside a request, as in a Celery task, it is empty and the actor is the system. That request is the Django one: DRF copies its user and auth onto it, but not its
authenticator, so a call made inside a DRF view without `request=` should pass `auth_method=`. A `category` or `types`
given here wins over the action's:

  ```python
  audit.log(auditing.USER_PROVISION, target=user)
  ```

- **Request fields are read from `request`**: the real client address, the path and the user agent. `http.request.id`
is the request id, settled by `AuditLogMiddleware` right after dockerflow assigned it, and echoed in the
`DOCKERFLOW_REQUEST_ID_HEADER_NAME` response header (`X-Request-ID` by default). The inbound id is kept only when
`REQUEST_ID_TRUST_HEADER` is set; otherwise the backend generates one, so a client never picks it.

- **Actors are derived** from `request.user`, `request.auth` and the DRF authenticator, whose class is mapped to an
auth method by `audit.register_auth_method` (see Configuration), as described in [Actors](#actors). Without a request,
the actor is the system. It is possible to override the actor with `actor=`, `actor_type=`, `auth_method=` and
`client_id=`. An explicit `actor_type=` keeps the account the request is signed in as; `actor=None` records none, as
for a caller failing to authenticate, an application acting before it is given a delegated user, or the system.

- **Targets are described** by their model name, primary key and the `fields` their model is registered with, see
[Targets](#targets). A model that is not registered is still identified. The account an action is about,
`user.target`, is found from the target unless given as `user_target=`. A peer service the backend calls is named with
`target_service=`. Extra keyword arguments land under `lasuite.details`.

- **Emission never raises.** A broken configuration or value is reported on the application logger (and Sentry) and the
business operation proceeds. A registered field that cannot be read is left out of the target, and the event is still
emitted.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AUDIT_LOG_LEVEL` | `INFO` | Level of the `audit` logger. |
| `AUDIT_LOG_STREAM` | `ext://sys.stdout` | Where the handler writes |
| `AUDIT_LOG_SERVICE_NAME` | `meet` | `service.name`, and the dataset `<name>.audit`, with any `-` turned into `_` |
| `AUDIT_LOG_DATA_STREAM_NAMESPACE` | `default` | `data_stream.namespace`: the data stream events are routed to is `logs-meet.audit-<namespace>`. It must not contain `-` |
| `NUM_PROXIES` | `1` | DRF's number of trusted proxies appending to `X-Forwarded-For`, shared with the throttles. The client is the entry that many positions from the right; anything a client injects lands further left and is ignored. `1` matches ingress-nginx defaults; use `2` behind a load balancer that also appends |
| `REQUEST_ID_TRUST_HEADER` | `False` | Reuse the inbound request id as `http.request.id`, so the ingress, Gunicorn, application logs and audit events share one id. Only set it when the ingress overwrites the header (`proxy_set_header X-Request-ID $request_id;` on ingress-nginx, which otherwise forwards the client's one): a client could else pick the id of someone else's request |
| `DOCKERFLOW_REQUEST_ID_HEADER_NAME` | `X-Request-ID` | Header carrying that id: read on the request only when `REQUEST_ID_TRUST_HEADER` is set, always echoed on the response |

The project describes itself to the facility in code, from `core/auditing.py`. The audit app imports the `auditing`
module of every installed app once it is ready:

- `audit.register(Model, fields=..., admin_values=..., category=..., entity_type=..., user_target=...)`: the `fields`
  describing a model as a target, the `admin_values` whose before and after values may be recorded in the admin, the
  `category` of its admin writes, its ECS `entity_type` when one of the allowed values fits (`application`, `user`...),
  and the attribute holding the account an event on it is about, as `user` for an access. A proxy model falls back to
  its concrete model. Registering a model twice raises `AlreadyRegistered`, an entity type ECS does not allow
  `ValueError`.
- `audit.register_auth_method(klass, name)`: the `lasuite.auth.method` of a DRF authentication class or of a login
  backend. A DRF class inherits the name of its closest registered base, and DRF's own classes are built in. A login
  backend must be registered itself, as custom backends often subclass `ModelBackend` for its permission checks
  alone; `ModelBackend` is built in as `password`.
