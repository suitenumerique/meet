# Audit logging

Meet keeps an **audit log**: a record of the notable things that happen in the product, such as a room created through the external API, a recording started, a sign-in, or a change made in the Django admin. Every entry answers the same questions: who did what, to what, on whose behalf, from where, and whether it worked.

- Each event is one line of JSON on the backend's standard output, from its own logger, `audit`, apart from the application logs.
- Events follow the [Elastic Common Schema](https://www.elastic.co/docs/reference/ecs) (ECS) 9.5.0, which most SIEMs read without extra setup.
- Audit logging is always on and needs no setting.

How the code emits events is in the [Code tour](../../contributing/code-tour.md#the-audit-log).

Personal data is kept to a minimum. A person is identified by their account id, their OIDC `sub` and the domain of their email address. Secrets, transit codes and the messages of unexpected exceptions are never recorded.

## What an event looks like

Pretty-printed, one event reads:

```json
{
  "@timestamp": "2026-09-15T08:41:12.345+00:00",
  "ecs": {"version": "9.5.0"},
  "data_stream": {"type": "logs", "dataset": "meet.audit", "namespace": "default"},
  "service": {"name": "meet", "environment": "production", "version": "1.36.3", "node": {"name": "meet-backend-6d8f7b9c4-x2x7q"}},
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

When an action is refused, the event keeps the name of the action that was attempted, here still `room.create`. Only the fields describing the outcome change:

```json
{
  "event": {"action": "room.create", "outcome": "failure", "type": ["creation", "denied"], "reason": "permission_denied"},
  "lasuite": {"outcome": "denied"},
  "http": {"response": {"status_code": 403}},
  "error": {"message": "..."},
  "log": {"level": "warning", "logger": "audit"}
}
```

## Collecting the events

Each event is one compact line on the backend's output. A log shipper tells it from the application logs by `data_stream.dataset: meet.audit`.

=== "Docker Compose"

    From `~/docker/meet`, print the backend's audit events. `--no-log-prefix` drops the container name Compose adds in front of each line, so every line stays valid JSON:

    ```bash
    docker compose logs --no-log-prefix backend | grep '"dataset":"meet.audit"'
    ```

=== "Kubernetes"

    Print the audit events of one backend pod:

    ```bash
    kubectl -n meet logs deployment/meet-backend | grep '"dataset":"meet.audit"'
    ```

    In production, a log shipper on each node collects the containers' output and routes the lines whose `data_stream.dataset` is `meet.audit` to the audit data stream.

## Configuration

Every audit variable and its default is in [Environment Variables: Audit logging](../../reference/env-variables.md#audit-logging). Three of them depend on your deployment:

- **`NUM_PROXIES`** counts the proxies in front of the backend that append to `X-Forwarded-For`; the rate limits use it too. The backend takes the client address that many entries from the right, so an address a client injects is ignored. The default, `1`, fits the Helm chart, whose ingress sends `/api/` straight to the backend. The Docker Compose template sets `2`, for the reverse proxy and the frontend's nginx: with `1` there, every event would record the reverse proxy as the client. Add one for a load balancer that also appends.
- **`REQUEST_ID_TRUST_HEADER`** reuses the request id the proxy sends, so the proxy, Gunicorn and the audit events share one id. Set it only when the proxy overwrites the header, on nginx with `proxy_set_header X-Request-ID $request_id;`. Otherwise nginx forwards the client's header, and a client could pick the id of someone else's request. `DOCKERFLOW_REQUEST_ID_HEADER_NAME` names that header.
- **`AUDIT_LOG_SERVICE_NAME`** and **`AUDIT_LOG_DATA_STREAM_NAMESPACE`** set the data stream events are meant for, `logs-<service name>.audit-<namespace>`. The backend turns any `-` in the service name into `_`, and refuses to start when the namespace contains a `-`.

## Answering common questions

**Who created, changed or deleted this room?** Filter on `entity.target.sub_type: room` with the room's id in `entity.target.id`, or its slug in `entity.target.raw.slug`. `event.action` says what happened, and `user.id` or `lasuite.application.client_id` who did it. Rooms are audited when they are handled through the external API, as `room.*`, or the Django admin, as `admin.room.*`.

**What has this application done?** Filter on `lasuite.application.client_id`. To include the attempts made before its credentials were verified, such as a wrong secret or an inactive application, also search `lasuite.details.claimed_client_id`.

**What did this person do, and what was done to their account?** `user.id` is the account whose authority an action used, and `user.target.id` the account an action was about: search both. To follow someone across the other La Suite products, use their OIDC `sub`, in `lasuite.actor.sub`.

**Which requests were refused, and why?** Filter on `lasuite.outcome: denied` and group by `event.reason`. A burst of `authentication_failed` on `user.login` or `application.token.issue` from a single `source.ip` deserves a closer look.

**What else happened during this request?** Search for its `http.request.id`, on every audit event of the request and in the Gunicorn access log, where it reads `rid=`. The application logs do not carry it. A single request may produce several events: an application obtaining a token for someone who never signed in produces both `user.provision` and `application.token.issue`.

## Fields reference

Every field is standard ECS, except those under `lasuite.*` and `entity.target.raw.*`, the fields of a target.

| Field | Meaning |
|---|---|
| `@timestamp` | When the event was emitted: ISO 8601, in UTC, with millisecond precision |
| `data_stream.*`, `event.dataset` | `logs`, `<AUDIT_LOG_SERVICE_NAME>.audit` and `AUDIT_LOG_DATA_STREAM_NAMESPACE`: what sets the audit stream apart from the application logs |
| `service.name`, `service.environment`, `service.version`, `service.node.name` | The backend instance that wrote the event: `AUDIT_LOG_SERVICE_NAME`, the current environment, the release and the host name, which is the pod on Kubernetes. Never the caller |
| `service.origin.name` | The internal service that called the backend, when the actor is a `service`: `roomkit`, `summary` or `livekit` |
| `service.target.name` | The service the backend called, such as `summary` for `recording.transcript.request` |
| `event.id` | Unique id of the event, so that a shipper retrying it cannot create a duplicate |
| `event.action` | What was attempted, from the [Catalogue](#catalogue), whatever the result: a refused `room.create` is still a `room.create` |
| `event.category`, `event.type` | The ECS classification: `api`, `authentication`, `iam` and others, with `creation`, `change`, `access`, `denied`, `user` and others. Always a combination ECS expects, see [Classification](#classification) |
| `event.outcome` | ECS `success` or `failure`, refusals included, or `unknown` when the result was reported in terms the backend does not recognise |
| `event.reason` | Why it did not succeed: `authentication_failed`, `permission_denied`, `rate_limited`, `validation_error`, `not_found`, `conflict`, `internal_error` |
| `lasuite.outcome` | `success`, `failure`, `denied` or `unknown`: the same as `event.outcome`, with refusals, such as a 401, 403 or 429, kept apart as `denied`, since ECS has no `denied` |
| `lasuite.actor.type` | `user`, `application`, `service`, `system` or `anonymous`, see [Actors](#actors) |
| `lasuite.actor.sub` | The OIDC `sub` of the account in `user.*`, when it has one: the identity it shares with the other La Suite products |
| `lasuite.auth.method` | How the actor proved who it is: `session`, `application_jwt`, `addons_jwt`, `user_access_jwt`, `resource_server`, `menshen_token`, `livekit_token`, `shared_secret`, `client_credentials`, `transit_code`, `oidc`, `password`, `none` when it did not authenticate, or `unknown` for an authentication class that is not registered. Requests served outside the API, such as the admin and logout, report `session` when signed in |
| `lasuite.application.client_id` | The external application acting, if any. Only set once its credentials are verified. For a Menshen token, Menshen's own client id, see [Actors](#actors) |
| `user.id`, `user.domain` | The account whose authority the action used, see [Actors](#actors): its primary key and email domain. The email address itself is never recorded |
| `user.roles` | That account's privileges when the event happened: `superuser`, `staff` |
| `user.target.id`, `user.target.domain` | The account the action was about: a provisioned user, the user an access grants a role to, the account an admin edits, or the user a transit code is minted for. `user.*` stays the actor |
| `organization.id` | The tenant: the application's client id when there is one, otherwise the user's email domain |
| `entity.target.*` | The resource acted on, see [Targets](#targets) |
| `lasuite.details` | Fields specific to the action, listed in the [Catalogue](#catalogue) |
| `client.ip`, `source.ip` | The real client address, never a proxy's: the same one the rate limits identify, see `NUM_PROXIES` in [Configuration](#configuration) |
| `http.request.method`, `url.path` | The request as received |
| `user_agent.original` | The client's `User-Agent`, cut at 1024 characters |
| `http.request.id` | The id shared by the audit events and the access log of one HTTP request, what other tools call a trace id. Also sent back as the `X-Request-ID` response header. Generated by the backend unless `REQUEST_ID_TRUST_HEADER` is set |
| `http.response.status_code` | The status of the response, for API calls and refusals |
| `error.message` | A human-readable reason for a failure |
| `error.type` | The class of an unhandled exception. Its message is left out, as it may contain personal data |
| `log.level` | `info` for a success, `warning` for failures, refusals and unknown outcomes, `error` for internal errors |

### Targets

The resource an action was performed on is described in ECS `entity.target`, a field set ECS added in 9.3 and still flags as beta.

| Field | Meaning |
|---|---|
| `entity.target.id` | Its primary key |
| `entity.target.sub_type` | Its model: `room`, `recording`, `user`, `application`, `resourceaccess` or `transit_code`, identified by its SHA-256 |
| `entity.target.type` | Its ECS entity type, when one fits: `user` for an account, `application` for an application |
| `entity.target.name` | Its name, when its model registers one |
| `entity.target.raw.*` | The other fields its model registers, such as a room's `slug` and `access_level`, or the OIDC `sub` of a user |

### Actors

`lasuite.actor.type` says who acted, and `user.*` whose authority the action used. The two differ when an application acts for a user: the actor is the application, and `user.*` is that user.

| `lasuite.actor.type` | Who | `user.*` |
|---|---|---|
| `user` | A person's account acting for itself: through a session, an OIDC or password login, an add-on token, or the LiveKit token of a known account. Device accounts are users like any other | That account |
| `application` | A client application acting on behalf of a user. Either a Meet application, through its client credentials, its delegated token or the user access token of its embedded frontend, or another La Suite application, through the resource server or a token exchanged with Menshen. `lasuite.application.client_id` names it | The delegating user |
| `service` | An internal service of the deployment calling the backend with a shared secret, named by `service.origin.name`: the LiveKit SIP bridge, `roomkit`, the summary service, `summary`, or the LiveKit server reporting on a recording, `livekit`. Never an account | Absent |
| `system` | The backend itself, with no inbound request, as in a Celery task | Absent |
| `anonymous` | A caller that did not authenticate, or failed to | Absent |

The backend picks the actor type by applying these rules in order:

1. A client id is known, usually from the token payload: `application`.
2. There is neither a request nor an actor: `system`.
3. The caller authenticated without an account, as an internal service: `service`.
4. The caller is an account: `user`.
5. Anything else: `anonymous`.

How an application acts for a user:

- Directly, with the delegated token it obtained through `application.token.issue`.
- Through an embedded frontend, which runs in an iframe where session cookies are blocked. The application mints a single-use, short-lived transit code for its delegated user, and the frontend exchanges the code for a user access token. Only the code's SHA-256 is ever logged.

A La Suite application may call the external API with a token exchanged through Menshen, La Suite's token exchange server:

- The call is recorded as an `application`, with `lasuite.auth.method` `menshen_token`.
- Menshen reports itself as the client the token was issued to, not the application that exchanged it. So `lasuite.application.client_id` and `organization.id` hold Menshen's client id for every such call.
- Never recorded: the token, its `jti`, which Menshen derives from an opaque token itself, and the email Menshen reports.

### Classification

`event.category` and `event.type` are only ever combined in the ways the ECS 9.5.0 `expected_event_types` allow:

- Each action declares its category, `api` by default, and its types.
- A refusal adds the `denied` type only when the category expects it. An API call becomes `["creation", "denied"]`. A failed login stays `["start"]`, and `event.outcome`, `event.reason` and `lasuite.outcome` show that it was refused.
- A 401 is also filed under `authentication`, as in `["api", "authentication"]`, so that it counts as a failed authentication.

When an audited API action raises an exception the backend does not handle, the event is still recorded: as a `failure` with reason `internal_error`, status code `500` and `error.type`.

## Catalogue

Action names are dotted and lower-case, in the form `<target>.<verb>`. The code emits no action outside this list.

### Applications and delegation

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `application.token.issue` | An application asks for a delegated token, `POST /external-api/v1.0/application/token/`, whether it gets one or is refused. It can be refused for bad credentials, an inactive application, an invalid or unauthorized email domain, an unknown user, or a provisioning conflict | On success: `user.*` is the delegated user, `entity.target` the application, and `lasuite.details` holds `scopes`, `user_provisioned` and `expires_in`. On refusal: `event.reason`, `http.response.status_code` and `lasuite.details.requested_domain`. Until its credentials are verified, the client id the caller submitted is only recorded as `lasuite.details.claimed_client_id`: it never sets `lasuite.application` or `organization` |
| `user.provision` | An application creates a provisional user from an email address, before that person ever signed in, or fails to. It is a `failure` with reason `conflict` when a concurrent request created the user first. Also emitted when a La Suite application calls the external API, through the resource server or with a Menshen token, for a `sub` no account has and `OIDC_CREATE_USER` lets the backend create one | `user.target` and `entity.target` are the user, the existing one on a conflict. `lasuite.auth.method` is `client_credentials`, `resource_server` or `menshen_token`. A provisional user has no `sub` yet: its id links this event to the winning one and to its later `user.login`. On a conflict over an email, `lasuite.details.requested_sub` is the `sub` no account was created for |
| `transit_code.issue` | An application mints a single-use transit code for its delegated user | `entity.target` is the code, whose `id` is its SHA-256. `user.target` is the user it is minted for. `lasuite.details.expires_in` |
| `transit_code.exchange` | An embedded frontend exchanges a transit code for a user access token | `event.category` is `authentication`, `lasuite.auth.method` is `transit_code`, and `entity.target` is the code's SHA-256. Once the code verifies, even if the exchange is then refused: `lasuite.actor.type` is `application`, the one that minted it, and `user.target` the user it was minted for. On success, `user.*` is that user too, with `lasuite.details.expires_in`. A code that does not verify is recorded as an `anonymous` failed authentication |

### Rooms

`room.*` covers the external API only. A room changed in the Django admin is an `admin.room.*` event.

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `room.create` | A room is created, or the attempt fails | `entity.target` is the room |
| `room.update` | A room is updated, or the attempt fails | `entity.target` is the room, refusals included. `lasuite.details.updated_fields` and `previous_access_level` |
| `room.delete` | A room is deleted, or the attempt fails. Deleting soft-deletes the room, see [Room purge](room-purge.md), and closes its LiveKit room | `entity.target` is the room, refusals included |
| `room.retrieve` | A room is read, or the attempt fails | `entity.target` is the room |
| `room.list` | Rooms are listed, or the attempt fails | `lasuite.details.total` |

### Recordings, transcripts and summaries

Transcripts and summaries are not recordings, but what the summary service derives from one. Their actions sit under `recording.transcript.*` and `recording.summary.*`, with the recording as their target.

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `recording.start` | Someone allowed to record, see [Recording: Who can record](recording.md#who-can-record), starts a recording, or the attempt fails: a recording already in progress, a worker error | `entity.target` is the recording, or the room when none was created. `lasuite.details.collect_metadata` |
| `recording.stop` | Someone allowed to record stops the recording in progress, or the attempt fails | `entity.target` is the recording, or the room when none is active |
| `recording.end` | LiveKit reports that a recording ended, through its `egress_ended` webhook: `success` when its media file is available, `failure` when it was aborted or failed, `unknown` for a status the backend does not map | `service.origin.name` is `livekit`. `entity.target` is the recording as it was before the report was processed. `lasuite.details.worker_event`, one of `completed`, `limit reached`, `aborted`, `failed`, and `error_code` |
| `recording.delete` | A recording is deleted, or the attempt fails | `entity.target` is the recording |
| `recording.transcript.request` | The backend sends a recording to the summary service to be transcribed, or fails to | `lasuite.actor.type` is `system`, `service.target.name` is `summary`, and `entity.target` is the recording. `lasuite.details.summary_requested`, whether a summary of the transcript is to be made too, and `job_id` |
| `recording.transcript.report` | The summary service reports on a transcript through `external-process-hook`, or a call to that hook is refused | `service.origin.name` is `summary`. `entity.target` is the recording, absent for an unknown job. `lasuite.details.job_id` and `status`. A failure the service reports is recorded as a `failure` |
| `recording.summary.report` | The summary service reports on a summary | Same as `recording.transcript.report` |

A recording's target says what was recorded:

- `mode` is how the media was captured: `screen_recording` for a video, `transcript` for an audio track;
- `requested_mode` is what the user asked for;
- `is_transcribed` says whether it is sent to the summary service.

`mode` and `requested_mode` differ for a transcript started with a screen capture: `mode` is then `screen_recording`, and `requested_mode` is `transcript`.

### Sign-in and the admin

| `event.action` | Emitted when | Notable fields |
|---|---|---|
| `user.login` | A user signs in, or a sign-in attempt fails: `denied`, with reason `authentication_failed` | `lasuite.auth.method` is `oidc`, `password` or `unknown`. On success, it is named after the login backend, also given in `lasuite.details.auth_backend`. On failure, it is named after the credentials submitted: a password, or the nonce of the OIDC callback |
| `user.logout` | A user signs out | |
| `admin.access` | A signed-in account without staff access reaches an admin page. Always denied, once per refused page | `event.category` is `web` and `event.type` is `access`. `event.reason`, and `http.response.status_code`: the redirect to the login page |
| `admin.<target>.<verb>` | A write is made through the Django admin, see [Django admin](#django-admin) | |

## Django admin

The admin is the most sensitive part of the product, so every write made through it produces an audit event. Django's own history entry is still written.

The action name follows a template, `admin.<target>.<verb>`, where `<target>` is the model name and `<verb>` one of:

| `<verb>` | Emitted when | Notable fields |
|---|---|---|
| `create` | An object is added | `lasuite.details.changed_fields`, `changes` |
| `update` | An object is changed | `lasuite.details.changed_fields`, `changes` |
| `delete` | An object is deleted: one event per object, once the deletion has run. A deletion that raises is a `failure` with reason `internal_error`, and in a bulk deletion every selected object is then reported as failed | `error.message` on failure |
| `action` | A bulk action runs | `lasuite.details.admin_action`, `count` |

This gives names such as `admin.room.update`, `admin.user.delete` or `admin.recording.action`. `event.category` is `iam` for anything that grants access to the product, and `configuration` otherwise. Writes on a user or a group put `user` or `group` first in `event.type`, as in `["user", "change"]`.

**What changed.**

- `lasuite.details.changed_fields` always lists the names of the fields a form changed, exactly the ones Django reports in its own history.
- `lasuite.details.changes` gives their values, as `{"from": ..., "to": ...}`, but only for the fields a model explicitly allows, see [Registering models](../../contributing/code-tour.md#registering-models-and-authentication-methods).
- Anything that looks like a secret is refused, whatever the allow-list says: a password change is reported as a change to `password`, never with its value.
- A JSON field on the allow-list, such as a room's `configuration`, is recorded as JSON rather than as a string, and both versions are kept whole.

**Inlines.** Objects edited through an inline produce their own event, linked to the parent's by `http.request.id`. Granting a role on a room produces both `admin.room.update` and `admin.resourceaccess.create`, whose `user.target` is the account granted the role.

**What is not covered:**

- **Reads.** Opening a change list, a change form or the history page emits nothing. Django's own history remains the record of who touched what.
- **Custom actions that bypass the ORM hooks.** An action calling `queryset.update()` or `queryset.delete()` directly is reported as a single `admin.<target>.action`, with its name and the number of objects, not one event per object. `delete_selected` is the exception: Django reports its objects one by one, so it emits one `admin.<target>.delete` per object and no `action` event.
