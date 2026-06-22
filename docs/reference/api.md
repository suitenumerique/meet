# API Reference

The Meet backend exposes a REST API at `/api/v1.0/`. All endpoints use JSON.

## Interactive API Explorer

When `USE_SWAGGER=True` is set on the backend, an interactive Swagger UI is available at `/api/v1.0/swagger/`. You can explore endpoints, send test requests, and view schemas directly from your browser.

Meet also exposes an **External API** at `/external-api/v1.0/` for server-to-server room management, with two authentication modes:

- **[Application-Delegated](external-api-delegated.md)** (`EXTERNAL_API_ENABLED=True`): your backend exchanges credentials for a JWT and acts on behalf of a user. [![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-Spec-brightgreen?logo=openapi-initiative)](openapi.yaml)
- **[Resource Server](external-api-resource-server.md)** (`OIDC_RS_*` vars): the user authenticates with the OIDC provider and presents their token directly. [![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-Spec-brightgreen?logo=openapi-initiative)](resource_server.yaml)


## Authentication

### Session authentication (browser)
Standard Django session authentication. Used by the frontend after OIDC login.

### Bearer token (server-to-server)
```
Authorization: Bearer <token>
```


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
  "language": "en-us"
}
```

### Update current user
```
PATCH /api/v1.0/users/me/
```
```json
{"language": "fr-fr"}
```


## Rooms

### List rooms
```
GET /api/v1.0/rooms/
```
Returns rooms the authenticated user is a member of.

### Create a room
```
POST /api/v1.0/rooms/
```
```json
{
  "name": "My Meeting Room",
  "slug": "my-meeting-room",
  "access_level": "public"
}
```
`access_level` values: `public`, `trusted`, `restricted`.

### Get a room
```
GET /api/v1.0/rooms/{id}/
```
When the user has access, the response includes a `livekit` object with the JWT token and server URL the browser uses to connect to the media server:
```json
{
  "id": "...",
  "name": "...",
  "slug": "...",
  "access_level": "public",
  "configuration": {},
  "livekit": {
    "url": "https://livekit.example.com",
    "room": "my-meeting-room",
    "token": "<livekit-jwt>"
  }
}
```

### Update a room
```
PATCH /api/v1.0/rooms/{id}/
```

### Delete a room
```
DELETE /api/v1.0/rooms/{id}/
```


## Room Access & Roles

Room roles (`owner`, `administrator`, `member`) are stored as `ResourceAccess` records. All write operations require the caller to be an owner or administrator of the room.

**Permission rules:**
- Owners can assign any role, including `owner`.
- Administrators can assign `member` or `administrator`, but not `owner`.
- Only one owner may remain - the last owner record cannot be deleted or downgraded.

> **Note:** Email invitations (`POST /api/v1.0/rooms/{id}/invite/`) send a join link but do **not** create an access record. The recipient joins as a plain participant with no persistent role.

### List room accesses

```
GET /api/v1.0/resource-accesses/
```

Returns accesses for rooms where the authenticated user is an owner or administrator.

**Response:**
```json
[
  {
    "id": "a1b2c3...",
    "resource": "550e8400-...",
    "user": {"id": "...", "email": "alice@example.com", "full_name": "Alice"},
    "role": "administrator"
  }
]
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

---

## Recording

### Start recording
```
POST /api/v1.0/rooms/{id}/start-recording/
```
```json
{
  "mode": "screen_recording",
  "options": {
    "language": "fr",
    "transcribe": false
  }
}
```
`mode` values: `screen_recording`, `transcript`. `options` is optional.

**Response:** HTTP 201 on success.

### Stop recording
```
POST /api/v1.0/rooms/{id}/stop-recording/
```

### List recordings (for current user)
```
GET /api/v1.0/recordings/
```

### Delete a recording
```
DELETE /api/v1.0/recordings/{id}/
```


## Lobby / Waiting room

### Request entry (attendee side)
```
POST /api/v1.0/rooms/{id}/request-entry/
```
```json
{"username": "Alice"}
```

### List waiting participants (administrator side)
```
GET /api/v1.0/rooms/{id}/waiting-participants/
```

### Admit or deny a participant
```
POST /api/v1.0/rooms/{id}/enter/
```
```json
{"participant_id": "...", "allow_entry": true}
```


## Participant management

### Mute a participant
```
POST /api/v1.0/rooms/{id}/mute-participant/
```
```json
{"participant_identity": "...", "track_sid": "..."}
```

### Remove a participant
```
POST /api/v1.0/rooms/{id}/remove-participant/
```
```json
{"participant_identity": "..."}
```

### Update participant metadata / permissions
```
POST /api/v1.0/rooms/{id}/update-participant/
```
```json
{"participant_identity": "...", "name": "New Name", "metadata": {}}
```

### Raise or lower hand
```
POST /api/v1.0/rooms/{id}/toggle-hand/
```
```json
{"raised": true}
```

### Rename (current participant)
```
POST /api/v1.0/rooms/{id}/rename/
```
```json
{"name": "Alice"}
```


## Files (in-meeting file sharing)

Requires `FILE_UPLOAD_ENABLED=True`.

### List files
```
GET /api/v1.0/files/
```

### Upload a file
```
POST /api/v1.0/files/
```

### Delete a file
```
DELETE /api/v1.0/files/{id}/
```

### Mark upload as complete
```
POST /api/v1.0/files/{id}/upload-ended/
```


## Internal webhooks

These endpoints are called by other services, not by the browser or external integrations.

### LiveKit webhook receiver
```
POST /api/v1.0/rooms/webhooks-livekit/
```
Called by LiveKit when room/egress events occur (recording started/stopped, etc.).

### Storage event webhook
```
POST /api/v1.0/recordings/storage-hook/
Authorization: Bearer <storage-webhook-token>
```
Called by ObjectStore when a recording file is uploaded.


## Frontend configuration

Returns feature flags and configuration for the frontend.

```
GET /api/v1.0/config/
```


## Health check

```
GET /healthz/
```
Returns HTTP 200 if the application is running.


## Pagination

List endpoints use page-number pagination:

```
GET /api/v1.0/rooms/?page=2&page_size=20
```

Default `page_size` is 20, maximum is 100.


## Error responses

All errors return a JSON body:

```json
{"detail": "Human-readable error message"}
```

| Code | Meaning |
|---|---|
| 400 | Bad request: invalid input |
| 401 | Unauthorized: missing or invalid auth |
| 403 | Forbidden: lacking permission |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal server error |


## Rate limiting

The API applies per-user rate limiting on specific endpoints (room entry requests, etc.). Rate limit errors return HTTP 429 with a `Retry-After` header.