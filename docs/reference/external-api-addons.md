# External API - Calendar Add-ons Auth

Meet exposes an external API at `/external-api/v1.0/` for server-to-server room management. This page covers the **calendar add-ons** authentication mode, used by calendar integrations (Outlook, etc.) running in embedded iframes.

Enable this mode with **both** `ADDONS_ENABLED=True` and `EXTERNAL_API_ENABLED=True` on the backend: the token is for the external API's room calls, which `EXTERNAL_API_ENABLED` mounts.

---

## When to use this mode

Use add-ons authentication when:

- You're building a calendar add-in that runs in an iframe
- You need the user to sign in through a popup, outside the add-in's iframe
- The user authenticates with Meet's OIDC provider

Compare with [Application-Delegated](external-api-delegated.md) (your backend acts on behalf of users) and [Resource Server](external-api-resource-server.md) (user presents their OIDC token directly).

---

## Authentication flow

The add-ons flow uses a three-step token exchange:

```mermaid
sequenceDiagram
    participant Addon as Calendar Add-in<br/>(iframe)
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

---

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

---

## Step 2: Exchange transit token

After the user authenticates in a popup, the callback page calls:

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

This binds the authenticated user's access token to the session. Transit tokens are single-use.

---

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

---

## Using the access token

```http
POST /external-api/v1.0/rooms/
Authorization: Bearer eyJhbGci...
Content-Type: application/json
```

```json
{
  "access_level": "trusted"
}
```

---

## Backend configuration

Every variable, with its default: [Environment Variables: Add-ons](env-variables.md#add-ons).

---

## Implementation reference

See `src/addons/outlook/` for a working example. The Outlook add-in uses this flow to create meeting rooms and insert the link into calendar events.

Implementation details:
- Session management: `src/backend/core/addons/service.py`
- API endpoints: `src/backend/core/addons/viewsets.py`
- Frontend example: `src/addons/outlook/src/common/api.js`
