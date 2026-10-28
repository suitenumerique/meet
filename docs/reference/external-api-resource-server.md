# Resource server (OAuth2)

In this mode, the user signs in at the OIDC provider Meet uses, and your application sends Meet the access token that provider issued. Meet asks the provider whether the token is valid, the standard [OAuth 2.0 resource server](https://www.oauth.com/oauth2-servers/the-resource-server/) pattern.

The mode needs:

- `EXTERNAL_API_ENABLED=True`, `OIDC_OP_URL`, `OIDC_OP_INTROSPECTION_ENDPOINT` and [`OIDC_RS_CLIENT_SECRET`](env-variables.md#external-api-oidc-resource-server);
- `OIDC_RS_CLIENT_ID`, unless the client is called `meet`, its default.

If one is missing, the backend starts without a warning, and every call presenting an OIDC token gets 401 with `Resource Server is improperly configured`.

## When to use this mode

- The user already signs in at your OIDC provider, and your application holds their access token.
- Users come from many organisations, and you want no list of email domains to maintain.

When your backend acts for users who never sign in, the [Application-delegated mode](external-api-delegated.md) fits instead.

## Getting the token

The user signs in at the OIDC provider and requests two kinds of scope, space-separated:

- at least one of the scopes listed in `OIDC_RS_SCOPES`, which tells Meet the token is meant for it;
- the room scope of each call your application makes, listed in [External API: Endpoints and scopes](external-api.md#scopes).

With `OIDC_RS_SCOPES` holding `lasuite_meet`, the request reads `openid lasuite_meet rooms:list rooms:create`. With `OIDC_RS_SCOPES_PREFIX=lasuite_meet`, `lasuite_meet:rooms:list` is accepted too. Ask whoever runs the Meet instance which form it expects.

Your application then sends the access token as `Authorization: Bearer <oidc-access-token>`.

## How Meet checks the token

On each call, Meet sends the token to `OIDC_OP_INTROSPECTION_ENDPOINT`, signing in to it as `OIDC_RS_CLIENT_ID` with `OIDC_RS_CLIENT_SECRET`. These are Meet's own client at the provider, not your application's. The provider's JSON response must contain:

- `active: true`;
- a `scope` containing at least one scope from `OIDC_RS_SCOPES`;
- the claim named by `OIDC_RS_AUDIENCE_CLAIM`.

Meet then finds the user by the token's `sub`. When no user has that `sub` and `OIDC_CREATE_USER` is on, Meet creates one with no email address.
