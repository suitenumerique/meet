# Application-delegated token

In this mode, your backend exchanges an application's client ID and secret for a short-lived token that acts for one user, named by email.

The token endpoint needs both `EXTERNAL_API_ENABLED=True` and [`APPLICATION_ENABLED=True`](env-variables.md#external-api-applications) on the backend. If either is missing, it returns 404 without saying which one is off.

## When to use this mode

- Your backend creates or manages rooms for your users, and the user never signs in during the call.
- The user has already signed in to Meet once. Meet creates no account for an unknown email unless `APPLICATION_ALLOW_USER_CREATION` and `OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION` are on and `OIDC_USER_SUB_FIELD_IMMUTABLE` is off.

When the user signs in at your OIDC provider anyway, the [Resource server mode](external-api-resource-server.md) uses their own token instead.

## Registering an application

Register each application in the Django admin, at `/admin/` under **Core → Applications**:

- Meet generates the client ID and secret. Copy the secret from the creation form: it is stored hashed and never shown again.
- Tick the scopes the application may use. Every token it obtains carries exactly those, whatever the user.
- Add email domains to restrict the users it may act for. With none, it may act for any address.

## Token request

```
POST /external-api/v1.0/application/token/
Content-Type: application/json
```

```json
{
  "client_id": "Hn3kQ8vZr2LmW5tYx9PcB7dF4gJ6sA1eU0oNiKqR",
  "client_secret": "your-application-secret",
  "grant_type": "client_credentials",
  "scope": "user@example.com"
}
```

`scope` holds only the email address of the user to act for.

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "rooms:list rooms:create"
}
```

`scope` lists the application's scopes. Send the token as `Authorization: Bearer <token>`, and request a new one after `expires_in` seconds.

## Errors

| Code | Body | When |
|---|---|---|
| 400 | `{"error": "Scope should be a valid email address."}` | `scope` is not an email address |
| 400 | A field name mapped to its messages | A field is missing, or `grant_type` is not `client_credentials` |
| 401 | `{"detail": "Invalid credentials"}` | The client ID or secret is wrong |
| 401 | `{"detail": "Application is inactive"}` | The application is switched off in the admin |
| 403 | `{"error": "This application is not authorized for this email domain."}` | The email's domain is not among the application's domains |
| 404 | `{"detail": "User not found."}` | No user has that email, and Meet may not create one |
| 409 | `{"error": "Failed to create or retrieve provisional user."}` | Creating the user for that email failed on a conflict |
