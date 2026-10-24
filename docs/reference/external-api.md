# External API

The external API lets another application create and manage Meet rooms for a user. It lives at `/external-api/v1.0/` and exists only when the backend sets `EXTERNAL_API_ENABLED=True`: without it, every path under `/external-api/` answers 404. Every call carries `Authorization: Bearer <token>`, and each token stands for one Meet user, so a call can do only what that user's roles allow.

[![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-application--delegated-brightgreen?logo=openapi-initiative)](openapi.yaml) [![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-resource%20server-brightgreen?logo=openapi-initiative)](resource_server.yaml)

Both specs import into Postman, Insomnia or any OpenAPI tool. The `EXTERNAL_API_*` and `APPLICATION_*` variables, with their defaults, are in [Environment Variables: External API](env-variables.md#external-api-applications).

## Getting a token

Four ways, compared:

| Way | How the token is obtained | Its scopes come from | Also needs |
|---|---|---|---|
| [Application-delegated](external-api-delegated.md) | Your backend sends a client ID and secret, registered in the Django admin, and the user's email. The user does not sign in during the exchange. | The scopes ticked on the application in the Django admin | `APPLICATION_ENABLED=True` |
| [Resource server (OAuth2)](external-api-resource-server.md) | The user signs in at your OIDC provider, and your application sends Meet the access token it issued. | The scopes your OIDC provider writes into the token | The `OIDC_RS_*` variables |
| [Add-ons](external-api-addons.md) | An add-in running inside another application, the Outlook add-in for one, signs the user in to Meet through a popup. | `ADDONS_TOKEN_SCOPE`, the same for every add-in token | `ADDONS_ENABLED=True` |
| [Menshen token exchange](#menshen-token-exchange) | Another La Suite service exchanges its user's token for one meant for Meet, at Menshen. | Menshen's `meet:room:create`, read as `rooms:create` | `MENSHEN_ENABLED=True` |

## Scopes

Each endpoint needs one scope in the token, and answers 403 without it.

| Scope | Allows |
|---|---|
| `rooms:list` | Listing the user's rooms |
| `rooms:retrieve` | Reading one room |
| `rooms:create` | Creating a room |
| `rooms:update` | Changing a room's access level and configuration |
| `rooms:delete` | Deleting a room |
| `users:session` | Getting a transit code that signs the user in to Meet in an iframe. Only an application-delegated token can use it. Unticking it on the application also stops the codes and the sign-ins it already gave. |

## Endpoints

| Method | Path | Scope | Who may call it |
|---|---|---|---|
| `GET` | `/external-api/v1.0/rooms/` | `rooms:list` | Any user. It returns the rooms where the user holds a role, 20 per page, with a `page` query parameter. |
| `POST` | `/external-api/v1.0/rooms/` | `rooms:create` | Any user. The user becomes the room's owner. Answers 201 with the room. |
| `GET` | `/external-api/v1.0/rooms/{id}/` | `rooms:retrieve` | A user holding any role on the room. Anyone else gets 403. |
| `PATCH` | `/external-api/v1.0/rooms/{id}/` | `rooms:update` | An administrator or owner of the room. Anyone else gets 403. |
| `DELETE` | `/external-api/v1.0/rooms/{id}/` | `rooms:delete` | An owner of the room. Anyone else gets 403. Answers 204. |
| `POST` | `/external-api/v1.0/users/transit-code/` | `users:session` | Any user, with an application-delegated token. Answers 404 unless `USER_ACCESS_TOKEN_ENABLED=True`. |

`{id}` is the room's id: a slug answers 404.

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
| `access_level` | `public`, `trusted`, `restricted` | Who joins without waiting, see [Room access levels](security.md#room-access-levels). Omitted on creation, it takes `EXTERNAL_API_DEFAULT_ACCESS_LEVEL`. `public` answers 400 unless `EXTERNAL_API_ALLOW_PUBLIC_ACCESS=True` or `EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`. |
| `configuration.can_publish_sources` | A list of `camera`, `microphone`, `screen_share`, `screen_share_audio` | The media participants may send. Omitted or `null`, all of them. |
| `configuration.everyone_can_mute` | `true` or `false` | Omitted counts as `true`: anyone in the room can mute others. `false` leaves it to administrators and owners. |

Any other key in `configuration` answers 400. An update replaces the stored `configuration` whole, so send every key you want to keep.

### Deleting a room

Deleting a room ends the meeting for everyone connected and stops its PIN from routing phone calls. The room disappears from the list, and a call naming it answers 410 from then on, or 403 to a user the call would have refused anyway. It keeps its slug and its PIN until the [room purge](env-variables.md#room-purge) removes it, so no new room takes them. Its recordings stay available to the people holding a role on them.

### Signing a user in to an iframe

The transit code lets an application show Meet in an iframe, where the browser blocks Meet's session cookie:

```json
{
  "transit_code": "<64 random characters>",
  "expires_in": 60
}
```

Open Meet in the iframe with `#transit_code=<code>` at the end of the room's URL, within `expires_in` seconds. Meet's frontend removes the code from the address bar and exchanges it for a token that acts as the user for `USER_ACCESS_TOKEN_TTL` seconds. A code works once. The settings are in [Environment Variables: User access tokens](env-variables.md#user-access-tokens).

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
| `name` | Always | Generated by Meet. A request cannot set it. |
| `slug` | Always | Derived from `name`. It ends the room's link. |
| `access_level`, `configuration` | Always | As sent, or the defaults |
| `url` | When `APPLICATION_BASE_URL` is set | `APPLICATION_BASE_URL/<slug>`, the link to share |
| `telephony` | When `ROOM_TELEPHONY_ENABLED=True` | The number to dial and the room's PIN |

## Errors

Errors on the room endpoints answer `{"detail": "..."}`, and a rejected body maps each field to its messages, as in `{"access_level": ["Public rooms are disabled for the external API."]}`.

| Code | When |
|---|---|
| 400 | The body is invalid |
| 401 | The token is missing, invalid or expired |
| 403 | The token lacks the endpoint's scope, or the user's role on the room does not allow the call |
| 404 | No room has that id, or `EXTERNAL_API_ENABLED` is off |
| 405 | The method is `PUT` |
| 410 | The room has been deleted |
| 500 | Closing the room on the media server failed during a deletion. The room is not deleted: try again. |

The application-delegated token endpoint answers its own errors, listed on [its page](external-api-delegated.md#errors).

## Menshen token exchange

Menshen is La Suite's OAuth 2.0 token exchange server. A La Suite service exchanges its user's access token at Menshen for one whose audience includes Meet, then sends that token as `Authorization: Bearer <token>`. On each call, Meet asks Menshen whether the token is active, signing in as `MENSHEN_CLIENT_ID`. Meet finds the user by the token's `sub`. When no user has it and `OIDC_CREATE_USER` is on, Meet creates one with the token's email.

Menshen names scopes `service:resource:action`. Meet reads `meet:room:create` as `rooms:create` and ignores every other, so a Menshen token can only create rooms. The settings are in [Environment Variables: Menshen](env-variables.md#external-api-menshen-token-exchange).
