# SSO & Authentication

LaSuite Meet uses **OpenID Connect (OIDC)** for user authentication. You need an OIDC provider to run a production instance.

## Overview

```mermaid
sequenceDiagram
    participant B as Browser
    participant BE as Meet Backend
    participant KC as OIDC Provider
    participant LK as LiveKit

    B->>BE: Visit Meet (unauthenticated)
    BE-->>B: Redirect → OIDC provider login
    B->>KC: Authenticate
    KC-->>B: Redirect → /api/v1.0/callback/?code=…
    B->>BE: GET /api/v1.0/callback/?code=…
    BE->>KC: Exchange code for tokens
    KC-->>BE: ID token + access token
    BE->>BE: Create / update user record
    BE-->>B: Session cookie, redirect → Meet
    B->>BE: Request LiveKit token
    BE-->>B: LiveKit JWT
    B->>LK: Connect via WebRTC
```

Meet does not manage passwords. Authentication is fully delegated to an external OIDC provider. This means:

- You can use your existing identity provider
- No user passwords are stored in Meet's database
- Users have a single login for Meet and other apps in your ecosystem

## Supported providers

Any standards-compliant OIDC provider works. Tested and documented:

| Provider | Type | Notes |
|---|---|---|
| Keycloak | Self-hosted | Included in the dev stack |
| Authentik | Self-hosted | Documented below |
| Dex | Self-hosted | Lightweight, connector-based |
| Auth0 | Cloud | Free tier available |
| Google Workspace | Cloud | For Google-based orgs |
| Microsoft Entra ID | Cloud | For Microsoft 365 orgs |
| ProConnect | Cloud | French government only |

## Setting up Keycloak (self-hosted)

The [Deployment Guide](../compose/deployment-guide.md) includes a complete Keycloak setup (with TLS via your reverse proxy, a pre-imported realm, and correct redirect URIs). Follow that guide for the recommended setup.

The summary of what the deployment setup does for Keycloak:

### Client configuration

Whatever the provider, Meet's client must have the settings below; Keycloak's names are used, and the deployment's realm (`meet`) ships with them:

- **Client ID**: `meet`
- **Client authentication**: enabled (confidential client)
- **Valid redirect URIs**: `https://meet.example.com/api/v1.0/callback/` . The trailing slash is required; the versioned path is not the standard `/oidc/callback/`
- **Web origins**: `https://meet.example.com`
- **Valid post logout redirect URIs**: `https://meet.example.com/*`. Without it, Keycloak refuses every logout Meet sends

### Meet environment variables

```dotenv
OIDC_RP_CLIENT_ID=meet
OIDC_RP_CLIENT_SECRET=<client-secret-from-keycloak>
OIDC_OP_JWKS_ENDPOINT=https://auth.example.com/realms/meet/protocol/openid-connect/certs
OIDC_OP_AUTHORIZATION_ENDPOINT=https://auth.example.com/realms/meet/protocol/openid-connect/auth
OIDC_OP_TOKEN_ENDPOINT=https://auth.example.com/realms/meet/protocol/openid-connect/token
OIDC_OP_USER_ENDPOINT=https://auth.example.com/realms/meet/protocol/openid-connect/userinfo
OIDC_OP_LOGOUT_ENDPOINT=https://auth.example.com/realms/meet/protocol/openid-connect/logout
```

> Keycloak must be served over HTTPS (`auth.example.com`, not `localhost:8080`). See the [Deployment Guide](../compose/deployment-guide.md) for the full setup.

> If you need to make manual changes after deployment, the Keycloak admin console is at `https://auth.example.com` (not on a raw port; it is proxied by your reverse proxy).

## Setting up Authentik (self-hosted)

### 1. Create a provider in Authentik

1. Go to **Applications → Providers → Create**
2. Choose **OAuth2/OpenID Provider**
3. Set **Redirect URIs**: `https://meet.example.com/api/v1.0/callback/`
4. Note the **Client ID** and **Client Secret**

### 2. Get the OIDC endpoints

From Authentik's well-known endpoint:
```
https://authentik.example.com/application/o/<slug>/.well-known/openid-configuration
```

### 3. Configure Meet

```dotenv
OIDC_RP_CLIENT_ID=<client-id>
OIDC_RP_CLIENT_SECRET=<client-secret>
OIDC_OP_JWKS_ENDPOINT=https://authentik.example.com/application/o/<slug>/jwks/
OIDC_OP_AUTHORIZATION_ENDPOINT=https://authentik.example.com/application/o/authorize/
OIDC_OP_TOKEN_ENDPOINT=https://authentik.example.com/application/o/token/
OIDC_OP_USER_ENDPOINT=https://authentik.example.com/application/o/userinfo/
```

## Setting up Google Workspace

### 1. Create OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project or select an existing one
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Add authorized redirect URI: `https://meet.example.com/api/v1.0/callback/`
6. Note the **Client ID** and **Client Secret**

### 2. Configure Meet

```dotenv
OIDC_RP_CLIENT_ID=<client-id>.apps.googleusercontent.com
OIDC_RP_CLIENT_SECRET=<client-secret>
OIDC_OP_JWKS_ENDPOINT=https://www.googleapis.com/oauth2/v3/certs
OIDC_OP_AUTHORIZATION_ENDPOINT=https://accounts.google.com/o/oauth2/v2/auth
OIDC_OP_TOKEN_ENDPOINT=https://oauth2.googleapis.com/token
OIDC_OP_USER_ENDPOINT=https://openidconnect.googleapis.com/v1/userinfo
OIDC_RP_SIGN_ALGO=RS256
```

## Unauthenticated access

While [`ALLOW_UNREGISTERED_ROOMS`](../../reference/env-variables.md#rooms-and-waiting-room) is `True`, anyone can start a meeting without an account by opening a room code no room uses yet, from **Join a meeting** or straight from the address bar. That meeting is open to anyone with the code, has no owner, and creates no room. With `False`, such a code answers 404 and only existing rooms can be joined.

Signed-in users create rooms from the home page. A room keeps its code and an owner, and its access level decides who joins: anyone with the link joins a `public` room, signed-in users join a `trusted` room directly, people holding a role on the room join a `restricted` one, and everyone else goes to the waiting room.

A new room takes the level its creator picked under **Settings → Rooms**. A creator who never picked one gets [`RESOURCE_DEFAULT_ACCESS_LEVEL`](../../reference/env-variables.md#rooms-and-waiting-room). To make it `trusted`:

```dotenv
RESOURCE_DEFAULT_ACCESS_LEVEL=trusted
```

The setting changes neither existing rooms nor the level a user already picked.

Unauthenticated users have limited permissions (no recording, no moderation).

## Customizing login redirect

`LOGIN_REDIRECT_URL` sets where users land after a **successful** login (default: the Meet home page):

```dotenv
LOGIN_REDIRECT_URL=/
```

`LOGIN_REDIRECT_URL_FAILURE` sets where users land if login fails.

## Testing authentication

After configuration:

1. Open `https://meet.example.com`
2. You should be redirected to your OIDC provider's login page
3. After login, you should be redirected back to Meet
4. Check the Django admin at `https://meet.example.com/admin/` to see if your user was created

## Troubleshooting

**Redirect URI mismatch**: The redirect URI in your OIDC provider must exactly match `https://meet.example.com/api/v1.0/callback/` (trailing slash matters).

**Invalid client secret**: Double-check the `OIDC_RP_CLIENT_SECRET` value.

**Token validation fails**: Ensure `OIDC_OP_JWKS_ENDPOINT` is reachable from the Meet backend container.

**User not created in database**: Check `docker compose logs backend` for OIDC-related errors.
