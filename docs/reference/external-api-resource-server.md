# External API - Resource Server (OAuth2)

Meet exposes an external API at `/external-api/v1.0/` for server-to-server room management. This page covers the **resource server** authentication mode, where the end user authenticates directly with the OIDC provider and receives a token that includes `lasuite_visio` scopes, which your application then presents to Meet.

This follows the standard [OAuth 2.0 Resource Server](https://www.oauth.com/oauth2-servers/the-resource-server/) pattern.

[![OpenAPI Spec](https://img.shields.io/badge/OpenAPI-Spec-brightgreen?logo=openapi-initiative)](resource_server.yaml)

---

## When to use this mode

Use resource server auth when:

- The end user already authenticates with your OIDC provider
- You want to use the user's own OIDC token to call Meet's API (no credential exchange needed)
- You are building a deep integration where Meet is one resource server among several in your platform

Compare with the [Application-Delegated mode](external-api-delegated.md), where your backend exchanges its own credentials for a token on behalf of a user.

---

## Authentication flow

```
1. The user authenticates with your OIDC provider and requests these scopes:
     lasuite_visio                  (mandatory - base scope)
     lasuite_visio:rooms:list       (as needed)
     lasuite_visio:rooms:create     (as needed)
     ...

2. The OIDC provider issues an access token containing those scopes.

3. Your app presents the access token to Meet:
     Authorization: Bearer <oidc-access-token>

4. When the access token expires, use the refresh token to get a new one
   without re-authenticating the user.
```

Meet validates the token against your OIDC provider using the `OIDC_RS_*` configuration.

---

## Scopes

| Scope | Permission |
|---|---|
| `lasuite_visio` | **Mandatory.** Base scope required for any API access. |
| `lasuite_visio:rooms:list` | List rooms accessible to the user |
| `lasuite_visio:rooms:retrieve` | Retrieve details of a specific room |
| `lasuite_visio:rooms:create` | Create new rooms |
| `lasuite_visio:rooms:update` | *(Coming soon)* Update existing rooms |
| `lasuite_visio:rooms:delete` | *(Coming soon)* Delete application-generated rooms |

---

## Endpoints

The endpoints are identical to the application-delegated mode - same paths, same request/response shapes. The only difference is how the Bearer token is obtained.

### List rooms
```
GET /external-api/v1.0/rooms
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
GET /external-api/v1.0/rooms/{id}
Authorization: Bearer <oidc-access-token>
```

---

## Backend configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `OIDC_RS_CLIENT_ID` | Yes | `meet` | Client ID registered with the OIDC provider as a resource server |
| `OIDC_RS_CLIENT_SECRET` | Yes | - | Client secret for the resource server |
| `OIDC_RS_SCOPES` | No | `["lasuite_meet"]` | List of scopes this resource server accepts |
| `OIDC_RS_SCOPES_PREFIX` | No | - | Prefix stripped from scope names before matching |
| `OIDC_RS_SIGNING_ALGO` | No | `ES256` | Algorithm used to sign tokens from the OIDC provider |
| `OIDC_RS_ENCRYPTION_ALGO` | No | `RSA-OAEP` | Encryption algorithm for token encryption |
| `OIDC_RS_ENCRYPTION_ENCODING` | No | `A256GCM` | Encoding for token encryption |
| `OIDC_RS_ENCRYPTION_KEY_TYPE` | No | - | Key type for token encryption |
| `OIDC_RS_PRIVATE_KEY_STR` | No | - | Private key for token decryption (if tokens are encrypted) |
| `OIDC_RS_AUDIENCE_CLAIM` | No | `client_id` | JWT claim used to identify the resource server audience |

---

## Full spec

The machine-readable OpenAPI 3.0 spec is available at [`resource_server.yaml`](resource_server.yaml). Import it into Postman, Insomnia, or any OpenAPI-compatible tool to explore and test the API interactively.