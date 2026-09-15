# External API - Application-Delegated Auth

Meet exposes an external API at `/external-api/v1.0/` for server-to-server room management. This page covers the **application-delegated** authentication mode, where your application exchanges its own credentials for a short-lived JWT and acts on behalf of a specific user.

Enable this mode with **both** `EXTERNAL_API_ENABLED=True` and `APPLICATION_ENABLED=True` on the backend. `EXTERNAL_API_ENABLED` mounts the `/external-api/v1.0/` router at all; `APPLICATION_ENABLED` separately gates the token endpoint itself. Missing either one returns a 404 with no other indication of which flag is missing.

[![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-Spec-brightgreen?logo=openapi-initiative)](openapi.yaml)

---

## When to use this mode

Use application-delegated auth when:

- Your backend needs to create or manage rooms on behalf of your users
- The end user never directly authenticates with Meet's OIDC provider
- You want tightly scoped, short-lived tokens per user action

Compare with the [Resource Server mode](external-api-resource-server.md), where the user authenticates directly with the OIDC provider.

---

## Authentication flow

```
1. Your app sends its client_id, client_secret and a scope containing user's email to:
   POST /external-api/v1.0/application/token/

2. Meet returns a short-lived Bearer JWT scoped to the target user's email.

3. Your app includes the JWT in all subsequent requests:
   Authorization: Bearer <token>

4. When the token expires, repeat step 1.
```

The application must be authorized for the user's email domain. Domain authorization is configured in the Meet Django admin under **External API applications**.

---

## Token request

```
POST /external-api/v1.0/application/token/
Content-Type: application/json
```

```json
{
  "client_id": "550e8400-e29b-41d4-a716-446655440000",
  "client_secret": "your-application-secret",
  "grant_type": "client_credentials",
  "scope": "user@example.com"
}
```

`scope` is the email address of the user on whose behalf you are acting.

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer"
}
```

---

## Scopes

| Scope | Permission |
|---|---|
| `rooms:list` | List rooms accessible to the delegated user |
| `rooms:retrieve` | Retrieve details of a specific room |
| `rooms:create` | Create new rooms |
| `rooms:update` | Update the access level and configuration of existing rooms |
| `rooms:delete` | *(Coming soon)* Delete application-generated rooms |

---

## Endpoints

### List rooms
```
GET /external-api/v1.0/rooms
Authorization: Bearer <token>
```

Returns rooms accessible to the delegated user. Supports `page` and `page_size` query parameters (default 20, max 100).

### Create a room
```
POST /external-api/v1.0/rooms/
Authorization: Bearer <token>
Content-Type: application/json
```

All fields are optional - omit the body entirely to use instance defaults. Returns HTTP 201 with the created room.

| Field | Type | Description |
|---|---|---|
| `access_level` | `"public"` \| `"trusted"` \| `"restricted"` | Who can join without going through the lobby. `public` is rejected with `400` unless the deployment explicitly sets `EXTERNAL_API_ALLOW_PUBLIC_ACCESS=True`. |
| `configuration.can_publish_sources` | array of `"camera"` \| `"microphone"` \| `"screen_share"` \| `"screen_share_audio"` | Restricts which media tracks participants may publish. `null`/omitted allows all sources. |
| `configuration.everyone_can_mute` | boolean | Whether any participant can mute others, or only the owner/moderator. `null`/omitted uses the server default. |

`configuration` rejects unknown fields (`400`). Only the two fields above are currently supported.

```json
{
  "access_level": "trusted",
  "configuration": {
    "everyone_can_mute": true
  }
}
```

### Retrieve a room
```
GET /external-api/v1.0/rooms/{id}
Authorization: Bearer <token>
```

### Update a room
```
PATCH /external-api/v1.0/rooms/{id}
Authorization: Bearer <token>
Content-Type: application/json
```

Only the delegated user's rooms where they are administrator or owner can be updated; any other role gets a `403`. Accepts the same `access_level`/`configuration` fields as room creation - `configuration` is replaced as a whole, not merged with the stored value. Full replacement (`PUT`) is not supported, only `PATCH`.

```json
{
  "access_level": "restricted"
}
```

---

## Backend configuration

| Variable | Required | Description |
|---|---|---|
| `EXTERNAL_API_ENABLED` | Yes | Mounts the `/external-api/v1.0/` router. Without it, every path under it 404s regardless of any other setting. |
| `APPLICATION_ENABLED` | Yes | Gates the token endpoint itself. `False` by default - also 404s if unset, even with `EXTERNAL_API_ENABLED=True`. |
| `APPLICATION_JWT_SECRET_KEY` | Yes | Secret used to sign issued JWTs |
| `APPLICATION_JWT_EXPIRATION_SECONDS` | No | Token lifetime in seconds (default: 3600) |
| `APPLICATION_ALLOW_USER_CREATION` | No | Auto-create Meet users on first token request |

Applications (client IDs and secrets) are managed in the Django admin at `/admin/` → **External API → Applications**.

---

## Full spec

The machine-readable OpenAPI 3.0 spec is available at [`openapi.yaml`](openapi.yaml). Import it into Postman, Insomnia, or any OpenAPI-compatible tool to explore and test the API interactively.