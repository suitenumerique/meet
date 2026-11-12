# SSO & Authentication

Meet signs users in through any [OpenID Connect](https://openid.net/developers/how-connect-works/) (OIDC) provider, as [Signing in](../../overview/how-meet-works.md#signing-in) shows. Every variable is in [Environment Variables: Authentication](../../reference/env-variables.md#authentication-oidc).

A provider that does not support `prompt=none`, the silent login Meet tries first, needs [`FRONTEND_IS_SILENT_LOGIN_ENABLED`](../../reference/env-variables.md#FRONTEND_IS_SILENT_LOGIN_ENABLED)`=False`.

## Client configuration

Register Meet at the provider as a confidential client, one that authenticates with a client secret, with:

- **Redirect URI**: `https://meet.example.com/api/v1.0/callback/`, trailing slash included
- **Post-logout redirect URI**: `https://meet.example.com/*`. Without it, Keycloak refuses every logout Meet sends
- **Web origin**: `https://meet.example.com`

Then give Meet the client ID and secret, and the provider's endpoints.

## Keycloak

The [Deployment Guide](../compose/deployment-guide.md#stack-2-identity-provider) runs Keycloak with this client already registered, and its Stack 3 fills in Meet's side.

## Authentik

1. In **Applications → Providers → Create**, choose **OAuth2/OpenID Provider**, set the redirect URI `https://meet.example.com/api/v1.0/callback/`, and note the client ID and secret.
2. In **Applications → Applications → Create**, create an application bound to that provider. Its slug fills `<slug>` in step 3.
3. Read the endpoints from `https://authentik.example.com/application/o/<slug>/.well-known/openid-configuration`, then set:

```dotenv title="env.d/common"
OIDC_RP_CLIENT_ID=<client-id>
OIDC_RP_CLIENT_SECRET=<client-secret>
OIDC_OP_JWKS_ENDPOINT=https://authentik.example.com/application/o/<slug>/jwks/
OIDC_OP_AUTHORIZATION_ENDPOINT=https://authentik.example.com/application/o/authorize/
OIDC_OP_TOKEN_ENDPOINT=https://authentik.example.com/application/o/token/
OIDC_OP_USER_ENDPOINT=https://authentik.example.com/application/o/userinfo/
OIDC_OP_LOGOUT_ENDPOINT=<end_session_endpoint from the well-known document>
```

Without [`OIDC_OP_LOGOUT_ENDPOINT`](../../reference/env-variables.md#OIDC_OP_LOGOUT_ENDPOINT), logging out ends the Meet session only: the provider's session survives, and the next visit signs the user straight back in.

## Google Workspace

1. In the [Google Cloud Console](https://console.cloud.google.com), open **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type **Web application**.
2. Add the redirect URI `https://meet.example.com/api/v1.0/callback/`, and note the client ID and secret.
3. Set:

```dotenv title="env.d/common"
OIDC_RP_CLIENT_ID=<client-id>.apps.googleusercontent.com
OIDC_RP_CLIENT_SECRET=<client-secret>
OIDC_OP_JWKS_ENDPOINT=https://www.googleapis.com/oauth2/v3/certs
OIDC_OP_AUTHORIZATION_ENDPOINT=https://accounts.google.com/o/oauth2/v2/auth
OIDC_OP_TOKEN_ENDPOINT=https://oauth2.googleapis.com/token
OIDC_OP_USER_ENDPOINT=https://openidconnect.googleapis.com/v1/userinfo
# profile makes Google send given_name
OIDC_RP_SCOPES=openid email profile
```

Google never sends `usual_name`, one of the default claims of [`OIDC_USERINFO_FULLNAME_FIELDS`](../../reference/env-variables.md#OIDC_USERINFO_FULLNAME_FIELDS): set [`OIDC_USERINFO_FULLNAME_FIELDS=given_name,family_name`](../../reference/env-variables.md#OIDC_USERINFO_FULLNAME_FIELDS) to show the full name.

Google has no logout endpoint for third parties: logging out ends the Meet session only.

## Unauthenticated access

[`ALLOW_UNREGISTERED_ROOMS`](../../reference/env-variables.md#ALLOW_UNREGISTERED_ROOMS) decides what happens when someone opens a room code that no room uses yet:

| [`ALLOW_UNREGISTERED_ROOMS`](../../reference/env-variables.md#ALLOW_UNREGISTERED_ROOMS) | Opening an unused room code |
|---|---|
| `True`, the code's default | Anyone starts a meeting without an account. It is open to anyone with the code, has no host and creates no room |
| `False`, as `env.d/production.dist/common` ships | Anonymous visitors get a 404. A signed-in visitor creates the room and becomes its host |

A new room's [access level](../../overview/how-meet-works.md#who-gets-in) comes from its creator or the server:

- A room created in Meet takes the level its creator picked under **Settings → Rooms**; one created through the [external API](../../reference/external-api.md#creating-and-updating-a-room) takes [`EXTERNAL_API_DEFAULT_ACCESS_LEVEL`](../../reference/env-variables.md#EXTERNAL_API_DEFAULT_ACCESS_LEVEL).
- A creator who never picked one gets [`RESOURCE_DEFAULT_ACCESS_LEVEL`](../../reference/env-variables.md#RESOURCE_DEFAULT_ACCESS_LEVEL). To make it `trusted`:

```dotenv title="env.d/common"
RESOURCE_DEFAULT_ACCESS_LEVEL=trusted
```

The setting changes neither existing rooms nor the level a user already picked.

## Test it

1. Open `https://meet.example.com` and click **Login**: you reach your provider's login page.
2. After signing in, you are back on Meet, signed in.
3. Your user appears in the Django admin at `https://meet.example.com/admin/`.

When it fails, see [Troubleshooting: Login issues](../../reference/troubleshooting.md#login-issues).
