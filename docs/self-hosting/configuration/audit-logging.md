# Audit logging

The **audit log** records who did what in Meet, to what, from where, and whether it worked: a sign-in, a room created through the external API, a recording, a change in the Django admin.

- It is always on and needs no setting.
- Each event is one JSON line on the backend's standard output, from the `audit` logger, apart from the application logs.
- Events follow the [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs) (ECS) 9.5.0.

A person is identified by their account id, their [OIDC](https://openid.net/developers/how-connect-works/) `sub` and their email's domain. Secrets, transit codes and the messages of unexpected exceptions are never recorded.

## What an event looks like

Pretty-printed:

```json
{
  "@timestamp": "2026-09-15T08:41:12.345+00:00",
  "ecs": {"version": "9.5.0"},
  "data_stream": {"type": "logs", "dataset": "meet.audit", "namespace": "default"},
  "service": {
    "name": "meet", "environment": "production", "version": "1.36.3",
    "node": {"name": "meet-backend-6d8f7b9c4-x2x7q"}
  },
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
  "http": {
    "request": {"id": "6f1c0d0e-2a8b-4c1d-9e7f-0a1b2c3d4e5f", "method": "POST"},
    "response": {"status_code": 201}
  },
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

A refused action changes only the outcome fields:

```json
{
  "event": {
    "action": "room.create", "outcome": "failure",
    "type": ["creation", "denied"], "reason": "permission_denied"
  },
  "lasuite": {"outcome": "denied"},
  "http": {"response": {"status_code": 403}},
  "error": {"message": "..."},
  "log": {"level": "warning", "logger": "audit"}
}
```

## Collecting the events

A log shipper tells audit events apart by `data_stream.dataset: meet.audit`.

=== "Docker Compose"

    From `~/docker/meet`:

    ```bash
    # --no-log-prefix drops the container name, so each line stays valid JSON
    docker compose logs --no-log-prefix backend | grep '"dataset":"meet.audit"'
    ```

=== "Kubernetes"

    ```bash
    kubectl -n meet logs deployment/meet-backend | grep '"dataset":"meet.audit"'
    ```

## Configuration

Every audit variable is in [Environment Variables: Audit logging](../../reference/env-variables.md#audit-logging). Two depend on your deployment:

- [`NUM_PROXIES`](../../reference/env-variables.md#NUM_PROXIES) decides which address an event records as the client. The default, `1`, fits the Helm chart, whose ingress sends `/api/` straight to the backend. Add one for a load balancer that also appends to `X-Forwarded-For`.
- [`REQUEST_ID_TRUST_HEADER`](../../reference/env-variables.md#REQUEST_ID_TRUST_HEADER) needs a proxy that overwrites the request id header. On nginx: `proxy_set_header X-Request-ID $request_id;`.

## Answering common questions

### Who created, changed or deleted this room?

Filter on `entity.target.sub_type: room` and the room's `entity.target.id`, or its slug in `entity.target.raw.slug`. Only the external API, `room.*`, and the Django admin, `admin.room.*`, are audited.

### What has this application done?

Filter on `lasuite.application.client_id`. Add `lasuite.details.claimed_client_id` for attempts made before its credentials were verified, such as a wrong secret.

### What did this person do, and what was done to their account?

Search both `user.id`, the account whose authority an action used, and `user.target.id`, the account it was about. Across the other La Suite products, use their OIDC `sub`, in `lasuite.actor.sub`.

### Which requests were refused, and why?

Filter on `lasuite.outcome: denied` and group by `event.reason`. Watch for bursts of `authentication_failed` from one `source.ip`.

### What else happened during this request?

Search its `http.request.id`: every audit event of the request carries it, and so does the Gunicorn access log, as `rid=`. The application logs do not.

## Fields reference

Every field is standard ECS, except those under `lasuite.*` and `entity.target.raw.*`.

| Field | Meaning |
|---|---|
| `@timestamp` | When the event was emitted: ISO 8601, UTC, milliseconds |
| `data_stream.*`, `event.dataset` | `logs`, `<service name>.audit` from [`AUDIT_LOG_SERVICE_NAME`](../../reference/env-variables.md#AUDIT_LOG_SERVICE_NAME), and [`AUDIT_LOG_DATA_STREAM_NAMESPACE`](../../reference/env-variables.md#AUDIT_LOG_DATA_STREAM_NAMESPACE): what sets the audit stream apart |
| `service.name`, `service.environment`, `service.version`, `service.node.name` | The backend instance that wrote the event, never the caller. On Kubernetes, the node name is the pod |
| `service.origin.name` | The internal service that called the backend, for a `service` actor: `summary` or `livekit` |
| `service.target.name` | The service the backend called, such as `summary` |
| `event.id` | Unique, so a shipper's retry cannot create a duplicate |
| `event.action` | What was attempted, from the [Catalogue](#catalogue), whatever the result |
| `event.category`, `event.type` | The ECS classification, see [Classification](#classification) |
| `event.outcome` | `success`, `failure`, refusals included, or `unknown` |
| `event.reason` | Why it failed: `authentication_failed`, `permission_denied`, `rate_limited`, `validation_error`, `not_found`, `conflict`, `internal_error` |
| `lasuite.outcome` | As `event.outcome`, with refusals, a 401, 403 or 429, kept apart as `denied` |
| `lasuite.actor.type` | `user`, `application`, `service`, `system` or `anonymous`, see [Actors](#actors) |
| `lasuite.actor.sub` | The OIDC `sub` of the account in `user.*`, shared with the other La Suite products |
| `lasuite.auth.method` | How the actor authenticated: `session`, `application_jwt`, `addons_jwt`, `user_access_jwt`, `resource_server`, `menshen_token`, `livekit_token`, `shared_secret`, `client_credentials`, `transit_code`, `oidc`, `password`, `none`, or `unknown` for an unregistered class. The admin and logout report `session` when signed in |
| `lasuite.application.client_id` | The external application acting, once its credentials are verified. For a Menshen token, Menshen's client id, see [Actors](#actors) |
| `user.id`, `user.domain` | The account whose authority the action used: primary key and email domain, never the address |
| `user.roles` | That account's privileges at the time: `superuser`, `staff` |
| `user.target.id`, `user.target.domain` | The account the action was about: a provisioned user, a user granted a role, an account an admin edits, the user of a transit code |
| `organization.id` | The tenant: the application's client id, otherwise the user's email domain |
| `entity.target.*` | The resource acted on, see [Targets](#targets) |
| `lasuite.details` | Fields specific to the action, see the [Catalogue](#catalogue) |
| `client.ip`, `source.ip` | The real client address, never a proxy's, as [`NUM_PROXIES`](../../reference/env-variables.md#NUM_PROXIES) sets |
| `http.request.method`, `url.path` | The request as received |
| `user_agent.original` | The client's `User-Agent`, cut at 1024 characters |
| `http.request.id` | Shared by the audit events and the access log of one request, and sent back as `X-Request-ID`. Generated unless [`REQUEST_ID_TRUST_HEADER`](../../reference/env-variables.md#REQUEST_ID_TRUST_HEADER) is set |
| `http.response.status_code` | The response status, for API calls and refusals |
| `error.message` | Why it failed, for a person to read |
| `error.type` | The class of an unhandled exception, without its message |
| `log.level` | `info` on success, `warning` for failures, refusals and unknown outcomes, `error` for internal errors |

### Targets

| Field | Meaning |
|---|---|
| `entity.target.id` | Its primary key |
| `entity.target.sub_type` | Its model: `room`, `recording`, `user`, `application`, `resourceaccess`, or `transit_code`, whose `id` is the code's SHA-256 |
| `entity.target.type` | `user` for an account, `application` for an application |
| `entity.target.name` | Its name, when its model registers one |
| `entity.target.raw.*` | The other fields its model registers, such as a room's `slug` and `access_level`, or a user's OIDC `sub` |

### Actors

| `lasuite.actor.type` | Who | `user.*` |
|---|---|---|
| `user` | An account acting for itself: session, OIDC or password login, add-on token, or the LiveKit token of a known account | That account |
| `application` | A client application acting for a user: a Meet application through its credentials, delegated token or embedded frontend, or a La Suite application through the resource server or Menshen. `lasuite.application.client_id` names it | The delegating user |
| `service` | An internal service calling with a shared secret, named in `service.origin.name`: `summary` or `livekit` | Absent |
| `system` | The backend itself, with no request, as in a Celery task | Absent |
| `anonymous` | A caller that did not authenticate, or failed to | Absent |

The backend takes the first rule that matches: a known client id gives `application`; no request and no actor, `system`; a caller authenticated without an account, `service`; an account, `user`; anything else, `anonymous`.

A call with a token exchanged through Menshen, La Suite's token exchange server, is an `application` with `lasuite.auth.method` `menshen_token`. `lasuite.application.client_id` and `organization.id` hold Menshen's client id. The token, its `jti` and the email Menshen reports are never recorded.

### Classification

`event.category` and `event.type` only ever combine as ECS 9.5.0 expects:

- Each action declares its category, `api` by default, and its types.
- A refusal adds `denied` only where the category expects it: an API call becomes `["creation", "denied"]`, a failed login stays `["start"]`.
- A 401 is also filed under `authentication`, as `["api", "authentication"]`.

## Catalogue

Actions read `<target>.<verb>`.

### Applications and delegation

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `application.token.issue` | An application asks for a delegated token, `POST /external-api/v1.0/application/token/`, granted or refused | On success, `user.*` is the delegated user, `entity.target` the application, `lasuite.details` holds `scopes`, `user_provisioned`, `expires_in`. On refusal, `event.reason` and `lasuite.details.requested_domain`. An unverified client id goes only in `lasuite.details.claimed_client_id` |
| `user.provision` | An application creates a provisional user from an email, or fails to: `conflict` when a concurrent request won. Also when a La Suite application calls for an unknown `sub` and [`OIDC_CREATE_USER`](../../reference/env-variables.md#OIDC_CREATE_USER) allows it | `user.target` and `entity.target` are the user. `lasuite.auth.method` is `client_credentials`, `resource_server` or `menshen_token`. On an email conflict, `lasuite.details.requested_sub` |
| `transit_code.issue` | An application mints a single-use transit code for its delegated user | `entity.target` is the code's SHA-256, `user.target` its user, `lasuite.details.expires_in` |
| `transit_code.exchange` | An embedded frontend exchanges a transit code for a user access token | `event.category` `authentication`, `lasuite.auth.method` `transit_code`. Once the code verifies, the actor is the application that minted it and `user.target` its user. A code that does not verify is an `anonymous` failed authentication |

### Rooms

`room.*` covers the external API, successes and failures alike. The Django admin's are `admin.room.*`.

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `room.create` | A room is created | `entity.target` is the room |
| `room.update` | A room is updated | `lasuite.details.updated_fields`, `previous_access_level` |
| `room.delete` | A room is soft-deleted, see [Room purge](room-purge.md), and its LiveKit room closed | `entity.target` is the room |
| `room.retrieve` | A room is read | `entity.target` is the room |
| `room.list` | Rooms are listed | `lasuite.details.total` |

### Recordings, transcripts and summaries

Transcripts and summaries come from a recording, so their actions sit under `recording.*`, with the recording as target.

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `recording.start` | Someone [allowed to record](recording.md#who-can-record) starts a recording, or the attempt fails | `entity.target` is the recording, or the room when none was created. `lasuite.details.collect_metadata` |
| `recording.stop` | Someone allowed to record stops it, or the attempt fails | `entity.target` is the recording, or the room when none is active |
| `recording.end` | LiveKit's `egress_ended` webhook reports the end: `success` with a media file, `failure` when aborted or failed, `unknown` otherwise | `service.origin.name` `livekit`. `lasuite.details.worker_event` and `error_code` |
| `recording.delete` | A recording is deleted, or the attempt fails | `entity.target` is the recording |
| `recording.transcript.request` | The backend sends a recording to the summary service, or fails to | Actor `system`, `service.target.name` `summary`. `lasuite.details.summary_requested`, `job_id` |
| `recording.transcript.report` | The summary service reports on a transcript, or its call is refused | `service.origin.name` `summary`. `lasuite.details.job_id`, `status` |
| `recording.summary.report` | The summary service reports on a summary | As `recording.transcript.report` |

A recording target's `mode` is how it was captured, `screen_recording` or `transcript`, and `requested_mode` what the user asked for. They differ for a transcript with **Also start a video recording** ticked. `is_transcribed` says whether it goes to the summary service.

### Sign-in and the admin

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `user.login` | A user signs in, or fails to: `denied`, `authentication_failed` | `lasuite.auth.method` `oidc`, `password` or `unknown`. `lasuite.details.auth_backend` on success |
| `user.logout` | A user signs out | |
| `admin.access` | An account without staff access reaches an admin page: always denied, once per page | `event.category` `web`, `event.type` `access` |
| `admin.<target>.<verb>` | A write through the Django admin, see [Django admin](#django-admin) | |

## Django admin

Every write through the Django admin is an `admin.<target>.<verb>` event, such as `admin.room.update`, beside Django's own history entry:

| `<verb>` | Emitted when | Notable fields |
|---|---|---|
| `create` | An object is added | `lasuite.details.changed_fields`, `changes` |
| `update` | An object is changed | `lasuite.details.changed_fields`, `changes` |
| `delete` | An object is deleted, one event each. A deletion that raises is a `failure`, `internal_error`, for every selected object | `error.message` on failure |
| `action` | A bulk action runs | `lasuite.details.admin_action`, `count` |

`event.category` is `iam` for anything granting access, `configuration` otherwise.

### What changed

- `lasuite.details.changed_fields` lists the fields the form changed, as Django's history does.
- `lasuite.details.changes` gives `{"from": ..., "to": ...}` only for the fields a model allows, see [Registering models](../../contributing/code-tour.md#registering-models-and-authentication-methods). A secret never appears: a password change shows only `password`.

### Inlines

An object edited through an inline has its own event, linked to its parent's by `http.request.id`. Granting a role on a room gives both `admin.room.update` and `admin.resourceaccess.create`.

### What is not covered

- **Reads**: opening a list, a form or the history emits nothing.
- **Custom actions calling `queryset.update()` or `.delete()`**: one `admin.<target>.action`, not one event per object. `delete_selected` still emits one `admin.<target>.delete` per object.
