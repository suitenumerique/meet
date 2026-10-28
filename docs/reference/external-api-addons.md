# Add-ons

In this mode, an add-in gets a token for the user by having them sign in to Meet in a popup. The add-in runs in an iframe inside another application, such as Outlook.

The session endpoints under `/api/v1.0/addons/sessions/` need [`ADDONS_ENABLED=True`](env-variables.md#add-ons) and answer 404 without it. The room calls made with the token afterwards need `EXTERNAL_API_ENABLED=True` as well.

## Authentication flow

```mermaid
sequenceDiagram
    participant Addon as Add-in<br/>(iframe)
    participant Backend as Meet Backend
    participant Dialog as Auth Dialog<br/>(popup)
    participant User

    Addon->>Backend: POST /api/v1.0/addons/sessions/init/
    Backend-->>Addon: transit_token, csrf_token<br/>(+ HttpOnly cookie: addonsSid)
    
    Addon->>Dialog: Open popup with transit_token
    Dialog->>User: Redirect to OIDC login
    User->>Dialog: Authenticate
    Dialog->>Backend: POST /api/v1.0/addons/sessions/exchange/<br/>(with transit_token)
    Backend-->>Dialog: OK
    Dialog->>Addon: Close popup
    
    loop Poll until authenticated
        Addon->>Backend: POST /api/v1.0/addons/sessions/poll/<br/>(csrf_token + addonsSid cookie)
        Backend-->>Addon: 202 Accepted {"state": "pending"}
    end
    
    Addon->>Backend: POST /api/v1.0/addons/sessions/poll/
    Backend-->>Addon: 200 OK {access_token, ...}<br/>(clears cookie)
    
    Addon->>Backend: POST /external-api/v1.0/rooms/<br/>Authorization: Bearer {access_token}
    Backend-->>Addon: Room created
```

## Step 1: Initialize session

```http
POST /api/v1.0/addons/sessions/init/
```

**Response (201):**
```json
{
  "transit_token": "abc123...",
  "csrf_token": "def456..."
}
```

The backend sets an `HttpOnly`, `Secure`, `SameSite=None` cookie named `addonsSid`.

## Step 2: Exchange transit token

The popup's callback page calls this endpoint once the user has signed in. The call needs the user's Meet session, so the callback must be a Meet page: without the session, the endpoint returns 401.

```http
POST /api/v1.0/addons/sessions/exchange/
Content-Type: application/json
```

```json
{
  "transit_token": "abc123..."
}
```

**Response (200):**
```json
{"status": "ok"}
```

This binds a token for the signed-in user to the session. A transit token works once: replaying it returns 400.

## Step 3: Poll for access token

```http
POST /api/v1.0/addons/sessions/poll/
X-CSRFToken: def456...
Cookie: addonsSid=...
```

**While pending (202):**
```json
{"state": "pending"}
```

**When ready (200):**
```json
{
  "state": "authenticated",
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 7200,
  "scope": "rooms:create"
}
```

The session is deleted and the cookie cleared after this final read.

## Implementation reference

- Working example, the Outlook add-in: [`src/addons/outlook/`](https://github.com/suitenumerique/meet/tree/main/src/addons/outlook)
- Its calls to the session endpoints: [`src/addons/outlook/src/common/api.js`](https://github.com/suitenumerique/meet/blob/main/src/addons/outlook/src/common/api.js)
