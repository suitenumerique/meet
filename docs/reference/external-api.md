# External API

The external API lets another application create and manage Meet rooms for a user, at `/external-api/v1.0/`.

## TL;DR

```bash
# 1. Get a token acting for alice@example.com, see Application-delegated
TOKEN=$(curl -s https://meet.example.com/external-api/v1.0/application/token/ \
  -H 'Content-Type: application/json' \
  -d '{"client_id": "<client id>", "client_secret": "<secret>",
       "grant_type": "client_credentials", "scope": "alice@example.com"}' \
  | jq -r .access_token)
# 2. Create a room and print its link, which needs APPLICATION_BASE_URL
curl -s https://meet.example.com/external-api/v1.0/rooms/ \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"access_level": "trusted"}' | jq -r .url
```

- The API needs [`EXTERNAL_API_ENABLED=True`](env-variables.md#EXTERNAL_API_ENABLED) on the backend: without it, every path under `/external-api/` answers 404.
- Every call carries `Authorization: Bearer <token>`. A token stands for one Meet user and can do only what that user's roles allow.
- Every route, with its request and response schemas, is in the OpenAPI files: [application-delegated](openapi.yaml) and [resource server](resource_server.yaml).

## Getting a token

| Way | How the token is obtained | Its scopes come from | Also needs |
|---|---|---|---|
| [Application-delegated](external-api-delegated.md) | Your backend sends the application's client ID and secret and the user's email; the user does not sign in | The scopes ticked on the application in the Django admin | [`APPLICATION_ENABLED=True`](env-variables.md#APPLICATION_ENABLED) |
| [Resource server (OAuth2)](external-api-resource-server.md) | Your application sends the access token the user got from your OIDC provider | The scopes your OIDC provider writes into the token | The `OIDC_RS_*` variables |
| [Add-ons](external-api-addons.md) | An add-in, such as the Outlook one, signs the user in to Meet in a popup | [`ADDONS_TOKEN_SCOPE`](env-variables.md#ADDONS_TOKEN_SCOPE), the same for every add-in token | [`ADDONS_ENABLED=True`](env-variables.md#ADDONS_ENABLED) |
| [Menshen token exchange](#menshen-token-exchange) | Another La Suite service exchanges its user's token at Menshen | Menshen's `meet:room:create`, read as `rooms:create` | [`MENSHEN_ENABLED=True`](env-variables.md#MENSHEN_ENABLED) |

## Endpoints and scopes { #scopes }

| Method | Path | Scope | Who may call it |
|---|---|---|---|
| `GET` | `/external-api/v1.0/rooms/` | `rooms:list` | Any user. Returns the rooms where they hold a role, 20 per page, with a `page` query parameter |
| `POST` | `/external-api/v1.0/rooms/` | `rooms:create` | Any user, who becomes the room's owner. Answers 201 with the room |
| `GET` | `/external-api/v1.0/rooms/{id}/` | `rooms:retrieve` | Any role on the room |
| `PATCH` | `/external-api/v1.0/rooms/{id}/` | `rooms:update` | An administrator or owner of the room |
| `DELETE` | `/external-api/v1.0/rooms/{id}/` | `rooms:delete` | An owner of the room. Answers 204 |
| `POST` | `/external-api/v1.0/users/transit-code/` | `users:session` | Any user, with an application-delegated token. Answers 404 unless [`USER_ACCESS_TOKEN_ENABLED=True`](env-variables.md#USER_ACCESS_TOKEN_ENABLED) |

- `{id}` is the room's id: passing a slug returns 404.
- Unticking `users:session` on an application also revokes the transit codes and sign-ins already given.

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
| `access_level` | `public`, `trusted`, `restricted` | Who joins without waiting, see [Room access levels](../user/features-controls.md#access-levels). Defaults to [`EXTERNAL_API_DEFAULT_ACCESS_LEVEL`](env-variables.md#EXTERNAL_API_DEFAULT_ACCESS_LEVEL). `public` is refused with 400 unless [`EXTERNAL_API_ALLOW_PUBLIC_ACCESS=True`](env-variables.md#EXTERNAL_API_ALLOW_PUBLIC_ACCESS) or [`EXTERNAL_API_DEFAULT_ACCESS_LEVEL=public`](env-variables.md#EXTERNAL_API_DEFAULT_ACCESS_LEVEL). |
| `configuration.can_publish_sources` | A list of `camera`, `microphone`, `screen_share`, `screen_share_audio` | The media members and guests may send. Owners and administrators get [`LIVEKIT_DEFAULT_SOURCES`](env-variables.md#LIVEKIT_DEFAULT_SOURCES) when they join, and so does everyone when the field is omitted or `null` |
| `configuration.everyone_can_mute` | `true` or `false` | `true` or omitted: anyone in the room can mute others. `false`: administrators and owners only |

Any other key in `configuration` is refused with 400. An update replaces the stored `configuration` whole, so send every key you want to keep.

### Deleting a room

- The meeting ends for everyone connected, and the room's PIN stops routing phone calls.
- The room leaves the list. A call naming it gets 410, or 403 for a user without the role.
- When the media server cannot close the room, the call answers 500 and the room is kept: retry.
- [Room purge](../self-hosting/configuration/room-purge.md#how-a-room-becomes-purgeable) lists what a deleted room keeps until it is purged.

### Showing Meet in an iframe { #signing-a-user-in-to-an-iframe }

```html
<iframe src="https://meet.example.com/abc-defg-hij"
        allow="camera; microphone; display-capture; fullscreen; autoplay"></iframe>
```

The [`allow` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#allow) lets the meeting use the camera, the microphone and screen sharing; without it the browser blocks them.

Meet's frontend sends no header forbidding framing, so a reverse proxy in front of it must not add one either.

A browser blocking third-party cookies drops Meet's session cookie inside the iframe, so the user joins signed out. To sign them in, your backend calls `POST /external-api/v1.0/users/transit-code/` with their application-delegated token, which answers:

```json
{
  "transit_code": "<64 random characters>",
  "expires_in": 60
}
```

- Append `#transit_code=<code>` to the iframe's URL, within `expires_in` seconds. A code works once.
- Meet's frontend exchanges it for a token acting as the user for [`USER_ACCESS_TOKEN_TTL`](env-variables.md#USER_ACCESS_TOKEN_TTL) seconds.

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
    "phone_number": "+33123456789",
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
| `url` | When [`APPLICATION_BASE_URL`](env-variables.md#APPLICATION_BASE_URL) is set | `APPLICATION_BASE_URL/<slug>`, the link to share |
| `telephony` | When [`ROOM_TELEPHONY_ENABLED=True`](env-variables.md#ROOM_TELEPHONY_ENABLED) | The number to dial and the room's PIN |

## Errors

Errors on the room endpoints return `{"detail": "..."}`, and a rejected body maps each field to its messages, as in `{"access_level": ["Public rooms are disabled for the external API."]}`.

| Code | When |
|---|---|
| 400 | The body is invalid |
| 401 | The token is missing, invalid or expired |
| 403 | The token lacks the endpoint's scope, or the user's role on the room does not allow the call |
| 404 | No room has that id, or [`EXTERNAL_API_ENABLED`](env-variables.md#EXTERNAL_API_ENABLED) is off |
| 405 | The method is `PUT`, from a token holding `rooms:update` |
| 410 | The room has been deleted |
| 500 | A deletion failed, see [Deleting a room](#deleting-a-room) |

The application-delegated token endpoint returns its own errors, listed on [its page](external-api-delegated.md#errors).

## Menshen token exchange

Menshen is La Suite's OAuth 2.0 token exchange server. A La Suite service exchanges its user's access token there for one whose audience includes Meet, and sends it as `Authorization: Bearer <token>`.

- Meet finds the user by the token's `sub`, or creates one with the token's email when [`OIDC_CREATE_USER`](env-variables.md#OIDC_CREATE_USER) is on. With [`OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION`](env-variables.md#OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION) on, an email another account holds is refused with 401.
- Meet ignores every Menshen scope except `meet:room:create`, so a Menshen token can only create rooms.

The settings are in [Environment Variables: Menshen](env-variables.md#external-api-menshen-token-exchange).
