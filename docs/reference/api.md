# API Reference

The Meet backend exposes a REST API at `/api/v1.0/`, which Meet's own frontend uses. All endpoints use JSON. Another application creating or managing rooms uses the [External API](external-api.md) instead.

## Interactive API Explorer

An interactive Swagger UI is served at `/api/v1.0/swagger/` when `DJANGO_CONFIGURATION` is `Development` or `Test`. `USE_SWAGGER` is fixed in each configuration class and is not read from the environment, so setting `USE_SWAGGER=True` does not turn it on in `Production` or `Demo`.

## Authentication

### Session authentication (browser)

Every endpoint uses the Django session the browser gets after signing in, unless its section names another token. These endpoints open and close the session:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1.0/authenticate/` | Starts the sign-in at the OIDC provider |
| `GET` | `/api/v1.0/callback/` | Where the OIDC provider sends the browser back after sign-in |
| `GET` | `/api/v1.0/logout/` | Signs the user out of Meet and of the OIDC provider |
| `GET` | `/api/v1.0/logout-callback/` | Where the OIDC provider sends the browser back after sign-out |
| `POST` | `/api/v1.0/backchannel-logout/` | Lets the OIDC provider end the user's Meet sessions directly |

### LiveKit room token

```
Authorization: X-LiveKit-Token <livekit token>
```

The token is the `livekit.token` returned by `GET /api/v1.0/rooms/{id}/`. It is accepted by `toggle-hand`, `rename`, `start-subtitle` and `mute-participant`, for the room it was issued for.

### User access token

```
Authorization: Bearer <user access token>
```

Meet's frontend uses it in place of the session when it runs in another application's iframe. It gets the token from `POST /api/v1.0/users/exchange-access-token/`, and every endpoint then treats the call as the user's, with the user's roles. How the application starts this is in [External API: Signing a user in to an iframe](external-api.md#signing-a-user-in-to-an-iframe).

## Users

### Get current user
```
GET /api/v1.0/users/me/
```
**Response:**
```json
{
  "id": "550e8400-...",
  "email": "user@example.com",
  "full_name": "Alice Martin",
  "short_name": "Alice",
  "timezone": "Europe/Paris",
  "language": "en-us",
  "default_room_access_level": "trusted",
  "default_room_configuration": {}
}
```

### Update current user
```
PATCH /api/v1.0/users/{id}/
```

```json
{"language": "fr-fr", "default_room_access_level": "restricted"}
```

`timezone`, `language`, `default_room_access_level` and `default_room_configuration` are writable. A room the user creates takes their `default_room_access_level` and `default_room_configuration` when the request leaves those fields out.

### Search users
```
GET /api/v1.0/users/?q=alice
```

Returns users whose email resembles `q`. Unless `ALLOW_UNSECURE_USER_LISTING=True`, it returns an empty list.

### Exchange a transit code
```
POST /api/v1.0/users/exchange-access-token/
```
```json
{"code": "<transit code>"}
```

Open to callers without a session: the transit code is the credential. Answers the token as `{"access_token": "...", "token_type": "Bearer", "expires_in": 7200, "scope": "user:access"}`.

| Code | When |
|---|---|
| 400 | `code` is missing or does not have the length of a transit code |
| 403 | The code is unknown, expired or already used; the caller already has a session; the user is deactivated; or the application no longer holds `users:session` |
| 404 | `USER_ACCESS_TOKEN_ENABLED` is off |

## Rooms

### List rooms
```
GET /api/v1.0/rooms/
```
Returns the rooms where the user holds a role.

### Create a room
```
POST /api/v1.0/rooms/
```
```json
{
  "name": "My Meeting Room",
  "access_level": "public"
}
```
`access_level` values: `public`, `trusted`, `restricted`, described in [Room access levels](security.md#room-access-levels). `slug` is read-only: Meet derives it from `name`. The creator becomes the room's owner. Each user may create a limited number of rooms per minute and per day, see [Rate limiting](security.md#rate-limiting).

### Get a room
```
GET /api/v1.0/rooms/{id-or-slug}/
```
Reading a room requires no sign-in. The response carries a `livekit` object, with the token and server URL the browser uses to join the media server, in three cases: the room is `public`, the room is `trusted` and the caller is signed in, or the caller holds a role on the room. Without `livekit`, the response also drops `pin_code`. Administrators and owners also get `accesses`, the list of roles on the room.

```json
{
  "id": "...",
  "name": "...",
  "slug": "...",
  "access_level": "public",
  "configuration": {},
  "pin_code": "1234567890",
  "livekit": {
    "url": "https://livekit.example.com",
    "room": "<room id (UUID)>",
    "token": "<livekit-jwt>"
  }
}
```

A slug matching no room answers 404, unless `ALLOW_UNREGISTERED_ROOMS=True`: then it answers `"id": null` with a `livekit` token for that slug. A deleted room answers 410 with `{"detail": "This room has been deleted."}`, whatever that setting.

### Update a room
```
PATCH /api/v1.0/rooms/{id}/
```
Requires being an administrator or owner of the room.

### Delete a room
```
DELETE /api/v1.0/rooms/{id}/
```
Requires being an owner of the room. Answers 204, ends the meeting for everyone connected, and stops the room's PIN from routing phone calls. The room then answers 410, or 403 to a caller lacking the role the call needs, and keeps its slug and PIN until the [room purge](env-variables.md#room-purge) removes it. Its recordings stay available to the people holding a role on them. When the media server cannot close the room, the call answers 500 and the room is not deleted.

### Other room endpoints

| Method | Path | Body | Who may call it |
|---|---|---|---|
| `POST` | `/api/v1.0/rooms/{id}/invite/` | `{"emails": ["bob@example.com"]}` | An administrator or owner. Each address gets a join link by email, and no role on the room. |
| `POST` | `/api/v1.0/rooms/creation-callback/` | `{"callback_id": "..."}` | Anyone. Returns the room created with that `callback_id` in its creation body, so a popup can hand the room back to the page that opened it. |

## Room Access & Roles

Room roles (`owner`, `administrator`, `member`) are stored as `ResourceAccess` records. All write operations require the caller to be an owner or administrator of the room.

**Permission rules:**
- Owners can assign any role, including `owner`, but cannot change or remove another owner's access.
- Administrators can assign `member` or `administrator`, but not `owner`.
- A room may have several owners; the last owner cannot be deleted or downgraded.

### List room accesses

```
GET /api/v1.0/resource-accesses/
```

Returns accesses for rooms where the authenticated user is an owner or administrator, paginated.

**Response:**
```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "a1b2c3...",
      "resource": "550e8400-...",
      "user": "<user id>",
      "role": "administrator"
    }
  ]
}
```

### Grant a role

```
POST /api/v1.0/resource-accesses/
```
```json
{
  "resource": "<room-id>",
  "user": "<user-id>",
  "role": "administrator"
}
```
`role` values: `owner`, `administrator`, `member`.

**Response:** HTTP 201 with the created access object.

### Change a role

```
PATCH /api/v1.0/resource-accesses/{id}/
```
```json
{"role": "member"}
```

### Revoke access

```
DELETE /api/v1.0/resource-accesses/{id}/
```

Returns HTTP 204. Fails with 403 if the record is the last owner.

The accesses of a deleted room can still be listed and read. Granting, changing or revoking one answers 410.

## Recording

Starting and stopping a recording answer 404 while `RECORDING_ENABLE` is off.

### Start recording
```
POST /api/v1.0/rooms/{id}/start-recording/
```
```json
{
  "mode": "screen_recording",
  "options": {
    "language": "fr",
    "transcribe": false,
    "collect_metadata": false,
    "original_mode": "screen_recording",
    "encoding": {"resolution": "720p", "profile": "talking_heads"}
  }
}
```
Requires being signed in and either of these:

- being an administrator or owner of the room;
- being connected to the meeting of a `public` or `trusted` room, while `RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED` is on, as it is by default.

A LiveKit room token is refused. `mode` values: `screen_recording`, `transcript`. `options` and each of its keys are optional, and any other key is rejected. `encoding` picks a resolution, and optionally a profile, among those of [Recording](env-variables.md#recording); it is accepted only while `RECORDING_CUSTOM_ENCODING_ENABLED` is on.

| Code | Body | When |
|---|---|---|
| 201 | `{"message": "..."}` | The recording started |
| 400 | `{"detail": "Invalid request."}` | `mode` or `options` is invalid, or `encoding` is sent while custom encoding is off |
| 409 | `{"error": "..."}` | A recording is already running in the room |
| 429 | `{"detail": "..."}` | The user started too many recordings, see [Rate limiting](security.md#rate-limiting) |
| 502 | `{"error": "..."}` | The recording service failed to start it |

The recording's roles are set when it starts. The person starting it becomes its `owner` if they are an owner or administrator of the room, and its `member` otherwise. Every other owner and administrator of the room becomes its `owner`. Each of them receives the email announcing a screen recording is ready. Later changes to the room's roles do not change the recording's.

### Stop recording
```
POST /api/v1.0/rooms/{id}/stop-recording/
```
The same people may stop it. Answers 404 when no recording is running, and 500 with `{"error": "..."}` when it fails to stop.

### List recordings
```
GET /api/v1.0/recordings/
```
Returns the recordings the user holds a role on.

### Get a recording
```
GET /api/v1.0/recordings/{id}/
```
Requires holding any role on the recording.

### Delete a recording
```
DELETE /api/v1.0/recordings/{id}/
```
Requires being an administrator or owner of the recording, and the recording to be finished.

## Lobby / Waiting room

| Method | Path | Body | Who may call it |
|---|---|---|---|
| `POST` | `/api/v1.0/rooms/{id}/request-entry/` | `{"username": "Alice", "participant_id": "..."}` | Anyone, signed in or not. The answer's `id` is a signed participant id: send it back as `participant_id` on each later poll to keep the place in the queue. The answer carries a `livekit` token once the participant is admitted. |
| `GET` | `/api/v1.0/rooms/{id}/waiting-participants/` | None | A signed-in administrator or owner of the room. In a `trusted` room, also any signed-in user connected to the meeting. A `public` room returns an empty list. |
| `POST` | `/api/v1.0/rooms/{id}/enter/` | `{"participant_id": "...", "allow_entry": true}` | The same people. A `public` room has no lobby and answers 404. |

Both lobby management endpoints refuse a LiveKit room token. A `participant_id` whose signature does not check out answers 400.

## In-meeting actions

`participant_identity` is the participant's LiveKit identity.

| Method | Path | Body | Who may call it |
|---|---|---|---|
| `POST` | `/api/v1.0/rooms/{id}/mute-participant/` | `{"participant_identity": "...", "track_sid": "..."}` | An administrator or owner, signed in. While the room's `everyone_can_mute` is on, also anyone connected to the meeting, with a LiveKit room token. Omitted, `everyone_can_mute` counts as on. |
| `POST` | `/api/v1.0/rooms/{id}/remove-participant/` | `{"participant_identity": "..."}` | An administrator or owner |
| `POST` | `/api/v1.0/rooms/{id}/update-participant/` | `participant_identity` and at least one of `name`, `metadata`, `attributes`, `permission` | An administrator or owner |
| `POST` | `/api/v1.0/rooms/{id}/update-participant-role/` | `{"participant_identity": "...", "role": "administrator"}` | An administrator or owner connected to the meeting. `role` is `member` or `administrator`, and nobody can change their own. A participant with a Meet account keeps the role as a `ResourceAccess`. |
| `POST` | `/api/v1.0/rooms/{id}/toggle-hand/` | `{"raised": true}` | The holder of a LiveKit room token, for their own hand |
| `POST` | `/api/v1.0/rooms/{id}/rename/` | `{"name": "Alice"}` | The holder of a LiveKit room token, for their own name. A participant with a Meet account gets 403 unless `AUTHENTICATED_PARTICIPANTS_CAN_EDIT_DISPLAY_NAME` is on. |
| `POST` | `/api/v1.0/rooms/{id}/start-subtitle/` | None | The holder of a LiveKit room token. Answers 404 unless `ROOM_SUBTITLE_ENABLED` is on. |

## Files (custom virtual background)

Every file endpoint answers 404 unless `FILE_UPLOAD_ENABLED=True`, and each user sees only their own files. An upload takes three steps:

1. `POST /api/v1.0/files/` with `{"type": "background_image", "filename": "beach.jpg"}` creates the record. Its answer carries `policy`, a signed URL in object storage.
2. The browser uploads the file with a `PUT` to that URL.
3. `POST /api/v1.0/files/{id}/upload-ended/` makes Meet check the uploaded file and mark it ready.

`GET /api/v1.0/files/` lists the user's files, and `DELETE /api/v1.0/files/{id}/` deletes one.

## Connection test

```
POST /api/v1.0/diagnostics/connection/
```

Open to anyone, signed in or not. Returns a short-lived LiveKit token for a throwaway room, so the browser can test its connection to the media server. Answers 404 unless `CONNECTION_TEST_ENABLED=True`.

## Internal endpoints

Other services call these, never the browser or an external application.

| Method | Path | Called by | Purpose |
|---|---|---|---|
| `POST` | `/api/v1.0/rooms/webhooks-livekit/` | LiveKit, signing each call with `LIVEKIT_API_SECRET` | Room, participant and recording events. The `egress_ended` event is how the backend learns a recording has finished uploading. |
| `POST` | `/api/v1.0/recordings/external-process-hook/` | The Summary service, with `Authorization: Bearer <SUMMARY_SERVICE_WEBHOOK_API_TOKEN>` | Reports the result of a transcription or summary job on a recording |
| `POST` | `/api/v1.0/roomkit/join/` | LiveKit's SIP module, with `Authorization: Bearer <ROOMKIT_SERVER_TO_SERVER_API_TOKEN>` | Prepares the room whose PIN a meeting-room device dialled, body `{"pin_code": "..."}`. Answers 404 unless `ROOMKIT_ENABLED` is on. |
| `GET` | `/api/v1.0/recordings/media-auth/` | The reverse proxy, as a subrequest | Checks that the user may download a recording under `/media/`, and returns the signed headers for object storage |
| `GET` | `/api/v1.0/files/media-auth/` | The reverse proxy, as a subrequest | The same check for an uploaded file |
| `GET` | `/jwks` | The OIDC provider | Publishes the public key matching `OIDC_RS_PRIVATE_KEY_STR`. It sits at the root, outside `/api/v1.0/`. |

## Frontend configuration

```
GET /api/v1.0/config/
```

Returns the feature flags and configuration the frontend reads.

## Health check

The backend answers on two paths, without sign-in:

- `/__lbheartbeat__` answers 200 as long as the process runs, without touching the database and whatever the `Host` header. The Helm chart probes startup and liveness on it.
- `/__heartbeat__` runs the health checks, the database connection and the applied migrations among them, and answers 500 when one fails. The Helm chart probes readiness on it.

The summary service answers on the same two paths, and its `/__heartbeat__` also fails when its Celery broker cannot be reached.

## Pagination

List endpoints use page-number pagination:

```
GET /api/v1.0/rooms/?page=2&page_size=50
```

Rooms, recordings and files accept `page_size`, from the default of 20 up to 100. The other lists return 20 per page whatever `page_size` says.

## Error responses

Validation errors (`400`) return field names mapped to lists of messages:

```json
{"access_level": ["\"bogus\" is not a valid choice."]}
```

The other errors come in three shapes:

- Authentication, permission and not-found errors return `{"detail": "..."}`, and so do some `400`s, an invalid recording request for one.
- Room actions, recording, participants and subtitles, return `{"error": "..."}`.
- The lobby returns `{"message": "..."}`.

| Code | Meaning |
|---|---|
| 400 | Bad request: invalid input |
| 401 | Unauthorized: missing or invalid auth |
| 403 | Forbidden: lacking permission |
| 404 | Not found |
| 410 | Gone: the room has been deleted |
| 429 | Rate limited |
| 500 | Internal server error |

## Rate limiting

The throttled actions and their settings are in [Security: Rate limiting](security.md#rate-limiting). Rate limit errors return HTTP 429 with a `Retry-After` header.
