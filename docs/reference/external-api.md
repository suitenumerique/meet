# External API

The external API lets another application create and manage Meet rooms for a user, at `/external-api/v1.0/`.

- It needs `EXTERNAL_API_ENABLED=True` on the backend: without it, every path under `/external-api/` answers 404.
- Every call carries `Authorization: Bearer <token>`. A token stands for one Meet user and can do only what that user's roles allow.

[![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-application--delegated-brightgreen?logo=openapi-initiative)](openapi.yaml) [![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-resource%20server-brightgreen?logo=openapi-initiative)](resource_server.yaml)

The `EXTERNAL_API_*` and `APPLICATION_*` variables, with their defaults, are in [Environment Variables: External API](env-variables.md#external-api-applications).

## Getting a token

| Way | How the token is obtained | Its scopes come from | Also needs |
|---|---|---|---|
| [Application-delegated](external-api-delegated.md) | Your backend sends the application's client ID and secret and the user's email; the user does not sign in | The scopes ticked on the application in the Django admin | `APPLICATION_ENABLED=True` |
| [Resource server (OAuth2)](external-api-resource-server.md) | Your application sends the access token the user got from your OIDC provider | The scopes your OIDC provider writes into the token | The `OIDC_RS_*` variables |
| [Add-ons](external-api-addons.md) | An add-in, such as the Outlook one, signs the user in to Meet in a popup | `ADDONS_TOKEN_SCOPE`, the same for every add-in token | `ADDONS_ENABLED=True` |
| [Menshen token exchange](#menshen-token-exchange) | Another La Suite service exchanges its user's token at Menshen | Menshen's `meet:room:create`, read as `rooms:create` | `MENSHEN_ENABLED=True` |

## Scopes

Each endpoint needs one scope in the token, and answers 403 without it.

| Scope | Allows |
|---|---|
| `rooms:list` | Listing the user's rooms |
| `rooms:retrieve` | Reading one room |
| `rooms:create` | Creating a room |
| `rooms:update` | Changing a room's access level and configuration |
| `rooms:delete` | Deleting a room |
| `users:session` | Getting a transit code that signs the user in to Meet in an iframe. Application-delegated tokens only. Unticking it also revokes the codes and sign-ins already given. |

## Endpoints

| Method | Path | Scope | Who may call it |
|---|---|---|---|
| `GET` | `/external-api/v1.0/rooms/` | `rooms:list` | Any user. Returns the rooms where they hold a role, 20 per page, with a `page` query parameter |
| `POST` | `/external-api/v1.0/rooms/` | `rooms:create` | Any user, who becomes the room's owner. Answers 201 with the room |
| `GET` | `/external-api/v1.0/rooms/{id}/` | `rooms:retrieve` | Any role on the room |
| `PATCH` | `/external-api/v1.0/rooms/{id}/` | `rooms:update` | An administrator or owner of the room |
| `DELETE` | `/external-api/v1.0/rooms/{id}/` | `rooms:delete` | An owner of the room. Answers 204 |
| `POST` | `/external-api/v1.0/users/transit-code/` | `users:session` | Any user, with an application-delegated token. Answers 404 unless `USER_ACCESS_TOKEN_ENABLED=True` |

- A user without the role the last column names gets 403.
- `{id}` is the room's id: passing a slug returns 404.

### Creating and updating a room

The body is optional on creation: an empty one takes the defaults.

```json
{
  "access_level": "trusted",
  "configuration": {
    "everyone_can_mute": false
  }
}
```

| Field | Values | Meaning |
|---|---|---|
| `access_level` | `public`, `trusted`, `restricted` | Who joins without waiting, see [Room access levels](security.md#room-access-levels). Defaults to `EXTERNAL_API_DEFAULT_ACCESS_LEVEL`. `public` is refused with 400 unless `EXTERNAL_API_ALLOW_PUBLIC_ACCESS=True` or `EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`. |
| `configuration.can_publish_sources` | A list of `camera`, `microphone`, `screen_share`, `screen_share_audio` | The media participants may send. When omitted or `null`, all of them are allowed |
| `configuration.everyone_can_mute` | `true` or `false` | `true` or omitted: anyone in the room can mute others. `false`: administrators and owners only |

Any other key in `configuration` is refused with 400. An update replaces the stored `configuration` whole, so send every key you want to keep.

### Deleting a room

- The meeting ends for everyone connected, and the room's PIN stops routing phone calls.
- The room leaves the list. A call naming it gets 410, or 403 for a user without the role.
- [Room purge](../self-hosting/configuration/room-purge.md#how-a-room-becomes-purgeable) lists what it keeps until it is purged.

### Signing a user in to an iframe

The transit code lets an application show Meet in an iframe, where the browser blocks Meet's session cookie:

```json
{
  "transit_code": "<64 random characters>",
  "expires_in": 60
}
```

- Open the room's URL in the iframe with `#transit_code=<code>` appended, within `expires_in` seconds. A code works once.
- Meet's frontend exchanges it for a token acting as the user for `USER_ACCESS_TOKEN_TTL` seconds.
- The settings are in [Environment Variables: User access tokens](env-variables.md#user-access-tokens).

## The room object

Every room endpoint but `DELETE` answers with this object, and the list wraps it in `count`, `next`, `previous` and `results`.

```json
{
  "id": "6f0e2a0c-4c35-4f3a-9a52-2c1b8f3e7d10",
  "name": "abc-defg-hij",
  "slug": "abc-defg-hij",
  "access_level": "trusted",
  "configuration": {},
  "url": "https://meet.example.com/abc-defg-hij",
  "telephony": {
    "enabled": true,
    "phone_number": "+33 1 23 45 67 89",
    "pin_code": "1234567890",
    "default_country": "FR"
  }
}
```

| Field | Present | Meaning |
|---|---|---|
| `id` | Always | The room's id, used in `{id}` |
| `name` | Always | Generated by Meet; a request cannot set it |
| `slug` | Always | Derived from `name`; the last part of the room's link |
| `access_level`, `configuration` | Always | As sent, or the defaults |
| `url` | When `APPLICATION_BASE_URL` is set | `APPLICATION_BASE_URL/<slug>`, the link to share |
| `telephony` | When `ROOM_TELEPHONY_ENABLED=True` | The number to dial and the room's PIN |

## Errors

Errors on the room endpoints return `{"detail": "..."}`, and a rejected body maps each field to its messages, as in `{"access_level": ["Public rooms are disabled for the external API."]}`.

| Code | When |
|---|---|
| 400 | The body is invalid |
| 401 | The token is missing, invalid or expired |
| 403 | The token lacks the endpoint's scope, or the user's role on the room does not allow the call |
| 404 | No room has that id, or `EXTERNAL_API_ENABLED` is off |
| 405 | The method is `PUT` |
| 410 | The room has been deleted |
| 500 | A deletion failed to close the room on the media server. The room is kept: retry |

The application-delegated token endpoint returns its own errors, listed on [its page](external-api-delegated.md#errors).

## Menshen token exchange

Menshen is La Suite's OAuth 2.0 token exchange server. A La Suite service exchanges its user's access token there for one whose audience includes Meet, and sends it as `Authorization: Bearer <token>`.

- On each call, Meet asks Menshen whether the token is active, signing in as `MENSHEN_CLIENT_ID`.
- Meet finds the user by the token's `sub`, or creates one with the token's email when `OIDC_CREATE_USER` is on.
- Meet reads `meet:room:create` as `rooms:create` and ignores every other scope, so a Menshen token can only create rooms.

The settings are in [Environment Variables: Menshen](env-variables.md#external-api-menshen-token-exchange).
