# External API - Resource Server (OAuth2)

Meet exposes an external API at `/external-api/v1.0/` for server-to-server room management. This page covers the **resource server** authentication mode, where the end user authenticates directly with the OIDC provider and receives a token that includes `lasuite_meet` scopes, which your application then presents to Meet.

This follows the standard [OAuth 2.0 Resource Server](https://www.oauth.com/oauth2-servers/the-resource-server/) pattern.

[![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-Spec-brightgreen?logo=openapi-initiative)](resource_server.yaml)

---

## When to use this mode

Use resource server auth when:

- The end user already authenticates with your OIDC provider
- You want to use the user's own OIDC token to call Meet's API (no credential exchange needed)
- Your integration is used by users spanning many/arbitrary email domains. Application-Delegated mode can optionally restrict an application to a fixed set of domains registered in the Meet admin, which doesn't scale well beyond a known, bounded set of organizations. Resource server mode has no such gate since the user's own OIDC-issued token is presented directly - trust is delegated entirely to whichever OIDC provider issued it.

Compare with the [Application-Delegated mode](external-api-delegated.md), where your backend exchanges its own credentials for a token on behalf of a user.

---

## Authentication flow

```
1. The user authenticates with your OIDC provider and requests these scopes:
     lasuite_meet                   (mandatory - base scope)
     rooms:list                     (as needed)
     rooms:create                   (as needed)
     ...

2. The OIDC provider issues an access token containing those scopes.

3. Your app presents the access token to Meet:
     Authorization: Bearer <oidc-access-token>

4. When the access token expires, use the refresh token to get a new one
   without re-authenticating the user.
```

Meet validates the token against your OIDC provider.

By default, request scopes as independent, space-separated tokens (e.g. `openid lasuite_meet rooms:list`) - they are **not** colon-joined by default. Some Meet instances may instead expect namespaced scopes like `lasuite_meet:rooms:list`; check with whoever operates your Meet instance which format it expects (see [`OIDC_RS_SCOPES_PREFIX`](#backend-configuration) below).

---

## Scopes

| Scope | Permission |
|---|---|
| `lasuite_meet` | **Mandatory.** Base scope required for any API access. |
| `rooms:list` | List rooms accessible to the user |
| `rooms:retrieve` | Retrieve details of a specific room |
| `rooms:create` | Create new rooms |
| `rooms:update` | Update the access level and configuration of existing rooms |
| `rooms:delete` | *(Coming soon)* Delete application-generated rooms |

---

## Endpoints

The endpoints are identical to the application-delegated mode - same paths, same request/response shapes, same `access_level`/`configuration` fields. The only difference is how the Bearer token is obtained. See [Application-Delegated: Endpoints](external-api-delegated.md#endpoints) for the full parameter reference (create/update body fields, scopes required per action).

### List rooms
```
GET /external-api/v1.0/rooms/
Authorization: Bearer <oidc-access-token>
```

### Create a room
```
POST /external-api/v1.0/rooms/
Authorization: Bearer <oidc-access-token>
Content-Type: application/json
```

```json
{
  "access_level": "restricted"
}
```

### Retrieve a room
```
GET /external-api/v1.0/rooms/{id}/
Authorization: Bearer <oidc-access-token>
```

### Update a room
```
PATCH /external-api/v1.0/rooms/{id}
Authorization: Bearer <oidc-access-token>
Content-Type: application/json
```

```json
{
  "access_level": "restricted"
}
```

---

## Backend configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RS_CLIENT_ID` | Yes | `meet` | Client ID registered with the OIDC provider as a resource server |
| `OIDC_RS_CLIENT_SECRET` | Yes | - | Client secret for the resource server |
| `OIDC_RS_SCOPES` | No | `["lasuite_meet"]` | List of scopes this resource server accepts |
| `OIDC_RS_SCOPES_PREFIX` | No | - | Unset by default: integrators must request flat, independent scopes (e.g. `lasuite_meet rooms:list`). Set this (e.g. `lasuite_meet`) if your IdP issues namespaced scopes like `lasuite_meet:rooms:list` instead - the prefix is stripped from each scope before matching. Tell integrators which format to use. |
| `OIDC_RS_SIGNING_ALGO` | No | `ES256` | Algorithm used to sign tokens from the OIDC provider |
| `OIDC_RS_ENCRYPTION_ALGO` | No | `RSA-OAEP` | Encryption algorithm for token encryption |
| `OIDC_RS_ENCRYPTION_ENCODING` | No | `A256GCM` | Encoding for token encryption |
| `OIDC_RS_ENCRYPTION_KEY_TYPE` | No | - | Key type for token encryption |
| `OIDC_RS_PRIVATE_KEY_STR` | No | - | Private key for token decryption (if tokens are encrypted) |
| `OIDC_RS_AUDIENCE_CLAIM` | No | `client_id` | JWT claim used to identify the resource server audience |

---

## Full spec

The machine-readable OpenAPI 3.0 spec is available at [`resource_server.yaml`](resource_server.yaml). Import it into Postman, Insomnia, or any OpenAPI-compatible tool to explore and test the API interactively.