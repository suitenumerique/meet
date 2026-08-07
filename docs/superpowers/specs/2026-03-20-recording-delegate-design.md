# Recording Delegate — Design Spec

## Problem

When a meeting organizer is absent, no one can start recording or transcription because only room admins/owners have that permission. This is a common scenario (secretary creates meetings for executives, organizer can't attend, etc.).

The PR #794 proposed opening recording permissions to all authenticated users, but this doesn't fit multi-tenant deployments where authenticated users may belong to different organizations.

## Solution

A lightweight **Recording Delegate** system that lets admins/owners grant recording-specific rights to individual users, with a request/approve flow for live meetings and auto-approval when no admin is present.

## Current State

### Backend

- `HasPrivilegesOnRoom` permission class is used on `start-recording` and `stop-recording` actions in `RoomViewSet` (viewsets.py:299, 349). This checks `is_administrator_or_owner()`.
- `ResourceAccess` model with roles: `owner`, `administrator`, `member`.
- No backend-to-client DataChannel messaging exists. The backend uses the LiveKit Server SDK only for webhooks, mute/remove/update participant operations via `ParticipantsManagement` service. There is no `ListParticipants` or `SendData` call.

### Frontend

- `NoAccessView` component already includes a `RequestRecording` button and a `handleRequest` prop.
- `ScreenRecordingSidePanel` already sends a `ScreenRecordingRequested` notification via DataChannel (client-to-client).
- `useHasRecordingAccess` hook checks `useIsAdminOrOwner()` to determine recording access.
- All DataChannel notifications are sent client-side via `useNotifyParticipants` → `room.localParticipant.publishData()`.

### What needs to change

- Replace `HasPrivilegesOnRoom` with `HasRecordingPermission` on recording endpoints (also check delegate status).
- Update `useHasRecordingAccess` to also check delegate status.
- Extend the existing `NoAccessView` request flow with backend-backed approval (currently it only sends a client-side notification with no persistence).
- Add `ListParticipants` capability to `ParticipantsManagement` service.
- Add backend-to-client notification capability via LiveKit Server SDK `RoomService.send_data()`.

## Design Decisions

- **Separate from the role system**: `RecordingDelegate` is a standalone model, not a new `RoleChoices` entry. This avoids polluting the existing owner/admin/member hierarchy and is easy to remove when a more advanced multi-admin system is built.
- **Session or permanent**: the admin choosing to grant rights decides whether the delegation is for the current session only or permanent.
- **Auto-approve for authenticated users**: when no admin/owner is present in the room, an authenticated user's request is auto-approved after 30s. This covers the "absent organizer" scenario without opening permissions globally.
- **Notifications are hybrid**: client-to-client for immediate UX feedback (request/grant/revoke), backend-to-client for auto-approve (only the backend knows when the 30s timer fires).

## Data Model

### RecordingDelegate

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `room` | FK → Room | The room this delegation applies to |
| `user` | FK → User (CASCADE) | The delegated user |
| `status` | CharField | `pending` or `approved` |
| `is_permanent` | Boolean (default=False) | False = session-only, True = persists across meetings |
| `granted_by` | FK → User (nullable, SET_NULL) | Who granted the rights. Null = auto-approved |
| `created_at` | DateTime (auto) | Timestamp |

**Constraints:**
- Unique together: `(room, user)`

The `status` field tracks pending requests in the database (not just Redis), so the `/approve/` endpoint can look up what it's approving, and the GET list can show pending requests to admins.

### Permission check

`HasRecordingPermission` replaces `HasPrivilegesOnRoom` on `start-recording` and `stop-recording` actions. It checks in order:
1. User is admin/owner of the room → allowed
2. User has a `RecordingDelegate` entry with `status=approved` for this room → allowed
3. Otherwise → denied

Delegates can both start AND stop recordings (a delegate who starts a recording can stop it).

## API Endpoints

All endpoints nested under `/api/v1.0/rooms/{room_id}/recording-delegates/`.

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/` | Admin/Owner | List delegates for this room (includes pending) |
| `POST` | `/` | Admin/Owner | Grant recording rights (direct, status=approved) |
| `DELETE` | `/{id}/` | Admin/Owner | Revoke a delegate |
| `POST` | `/request/` | Authenticated | Request recording rights (creates status=pending) |
| `POST` | `/{id}/approve/` | Admin/Owner | Approve a pending request |
| `POST` | `/{id}/reject/` | Admin/Owner | Reject a pending request (deletes the entry) |

### Payloads

**POST (grant):**
```json
{
  "user": "uuid",
  "is_permanent": false
}
```

**POST approve:**
```json
{
  "is_permanent": false
}
```

**POST (request):**
No body needed — user is derived from `request.user`.

**GET (list) response:**
```json
[
  {
    "id": "delegate-uuid",
    "user": { "id": "user-uuid", "name": "Jean Dupont" },
    "status": "approved",
    "is_permanent": true,
    "granted_by": { "id": "admin-uuid", "name": "Marie Martin" },
    "created_at": "2026-03-20T10:00:00Z"
  }
]
```

## New Backend Infrastructure

### LiveKit ListParticipants

Add a `list_participants(room_name)` method to `ParticipantsManagement` service using `livekit.api.RoomService.list_participants()`. This returns the list of currently connected participants with their identity (which maps to the user ID set when generating the LiveKit token).

### LiveKit SendData (backend → client)

Add a `send_data(room_name, data, participant_identities)` method to `ParticipantsManagement` service using `livekit.api.RoomService.send_data()`. This is needed for the auto-approve flow where the backend must notify the requester after the Celery timer fires.

### Participant identity mapping

LiveKit participant `identity` is set to the Django user's UUID string when the LiveKit token is generated. The `list_participants` response provides these identities, which can be directly matched against `ResourceAccess.user_id` to determine which participants are admins/owners.

## Delegation Flows

### Flow 1: Push by admin (direct grant)

1. Admin clicks "Grant recording rights" on a participant
2. `POST /recording-delegates/` with `{ user, is_permanent }`
3. `RecordingDelegate` created with `status=approved, granted_by=admin`
4. Admin's frontend sends DataChannel notification to participant: `RecordingRightsGranted`
5. Participant sees recording buttons appear

### Flow 2: Request by participant

1. Participant clicks "Request recording rights"
2. `POST /recording-delegates/request/`
3. Backend creates `RecordingDelegate` with `status=pending`
4. Backend calls `list_participants` and cross-references with `ResourceAccess` to check admin presence

**Case A — Admin present:**
5. Requester's frontend sends DataChannel notification to admins: `RecordingRightsRequested` (with delegate ID and user info)
6. Admin sees popup: "X requests recording rights" [Session only] [Permanent] [Reject]
7. Admin clicks → `POST /recording-delegates/{id}/approve/` or `/{id}/reject/`
8. Backend updates `RecordingDelegate` status to `approved` (or deletes on reject)
9. Admin's frontend sends DataChannel notification to requester: `RecordingRightsGranted` or `RecordingRightsRejected`

**Case B — No admin present:**
5. Backend schedules a Celery task with `countdown=30` seconds, storing the task ID in cache as `auto_approve:{delegate_id}`
6. API response includes `auto_approve_seconds: 30`
7. Frontend shows countdown: "No admin present. Auto-approval in 30s..."
8. After 30s, Celery task fires:
   - Re-checks the `RecordingDelegate` still exists and is still `pending` (requester may have left)
   - Re-checks no admin is present via `list_participants`
   - If both conditions met: updates to `status=approved, granted_by=null, is_permanent=False`
   - Sends notification via `RoomService.send_data()`: `RecordingRightsGranted`
   - If an admin is now present: does nothing (admin will handle via Case A)
9. If an admin connects during the 30s:
   - Admin's frontend fetches pending requests via `GET /recording-delegates/?status=pending`
   - Admin sees and handles the request (Case A flow)
   - When admin approves/rejects, the `status` changes and the Celery task's re-check at step 8 will find it's no longer `pending` → no-op

### Flow 3: Pre-meeting

1. Owner/admin goes to room management page
2. Searches for users and adds them as recording delegates
3. `POST /recording-delegates/` with `{ user, is_permanent: true }`

### Revocation

1. Admin/owner clicks revoke on a delegate
2. `DELETE /recording-delegates/{id}/`
3. Admin's frontend sends DataChannel notification to participant: `RecordingRightsRevoked`
4. Recording buttons disappear in real-time
5. Any active recording started by this delegate continues to completion

## Real-time Communication

### Notification types

| Type | Mechanism | Sent by | Sent to | Trigger |
|---|---|---|---|---|
| `RecordingRightsRequested` | DataChannel (client) | Requester's browser | Admins in room | Participant requests rights |
| `RecordingRightsGranted` | DataChannel (client) or SendData (backend for auto-approve) | Admin's browser / backend | Requester | Approved or auto-approved |
| `RecordingRightsRejected` | DataChannel (client) | Admin's browser | Requester | Rejected |
| `RecordingRightsRevoked` | DataChannel (client) | Admin's browser | The delegate | Admin revokes rights |

## Frontend Components

### Participant side (authenticated, non-admin)

Extend the existing `NoAccessView` component in `ScreenRecordingSidePanel`. The existing `RequestRecording` button and `handleRequest` prop are reused but connected to the new backend API instead of the current client-only notification.

States: `idle` → `pending` (with 30s countdown if auto-approve) → `granted` / `rejected`

Once `granted`: standard start/stop recording buttons appear.

### Admin side

- **Toast/popup** on incoming `RecordingRightsRequested` notification: "X requests recording rights" with actions [Session only] [Permanent] [Reject]
- **Participant context menu**: "Grant recording rights" → sub-menu [Session] [Permanent]
- On room join, fetch pending requests via `GET /recording-delegates/?status=pending` to catch requests made before the admin connected

### Room management page (pre-meeting)

New "Recording Delegation" section in the Admin panel:
- User search field + list of current delegates with revoke button
- Only visible to admin/owner

### Hooks

**`useRecordingDelegate(roomId)`**
```
→ { isDelegate, requestRights(), pendingRequest, countdown }
```

**Update `useHasRecordingAccess`** to also return `true` when the user is a delegate (`status=approved`).

## Cleanup

### Definition of "session"

A session corresponds to a LiveKit room lifecycle (first participant joins → last participant leaves). Non-permanent delegates are cleaned up when the room ends, with a **5-minute grace period** to handle brief disconnections (all participants drop and reconnect quickly).

### Primary: LiveKit webhook `room_finished`

When `room_finished` fires, schedule a Celery task with `countdown=300` (5 minutes). When the task runs:
- Check if the room is still empty via `list_participants`
- If empty: delete all `RecordingDelegate` entries with `is_permanent=False` for that room
- If participants are back: do nothing (new session started)

### Safety net: Celery periodic task

Every 6 hours, delete non-permanent delegates with `created_at` older than 24h. Covers missed webhooks. The 24h window is generous enough to cover multi-hour meetings.

## Edge Cases

| Case | Behavior |
|---|---|
| Delegate starts recording then is revoked | Active recording continues. Revocation prevents new recordings. |
| Two participants request simultaneously (auto-approve) | Independent requests. Both get rights after 30s. |
| Admin arrives during 30s countdown | Admin fetches pending requests on join. Celery task re-checks status before approving — if admin already handled it, task is a no-op. |
| Requester leaves room during countdown | Frontend does not cancel the pending — Celery task re-checks the delegate still exists. If the requester deleted their request on leave, task is a no-op. |
| Permanent delegate's user deleted | FK CASCADE removes the delegate entry. |
| Duplicate request by same user | Unique constraint `(room, user)` prevents duplicates. Returns 200 with existing delegate if already exists. |
| Brief room-empty gap (all disconnect/reconnect) | 5-minute grace period on `room_finished` prevents premature cleanup. |

## Security

- **Authentication required**: `IsAuthenticated` on `/request/` endpoint
- **Rate limiting**: `SessionExchangeAnonRateThrottle`-style throttle on `/request/` — 5 requests/min per user per room. Returns HTTP 429 when exceeded.
- **Audit trail**: `granted_by` field traces who granted (null = auto-approved), `created_at` for timing
- **No anonymous auto-approve**: only authenticated users can trigger auto-approval
- **Celery task safety**: auto-approve task re-checks both `status=pending` and admin absence before granting — no race condition

## Tests

### Backend (pytest)

**Model:**
- CRUD operations on `RecordingDelegate`
- Unique constraint `(room, user)` enforced
- CASCADE delete on user/room deletion
- Status transitions: pending → approved, pending → deleted (reject)

**Permissions:**
- Admin/owner can start-recording (unchanged)
- Delegate (status=approved) can start-recording → 201
- Delegate (status=pending) cannot start-recording → 403
- Authenticated non-delegate → 403
- Anonymous → 401
- Revoked delegate → 403
- Delegate can stop-recording they started → 200

**API:**
- POST delegate: admin → 201, non-admin → 403
- DELETE delegate: admin → 204, non-admin → 403
- POST request: authenticated → 201 (pending created), anonymous → 401, existing delegate → 200
- POST approve: admin → 200 (status updated), non-admin → 403
- POST reject: admin → 200 (delegate deleted), non-admin → 403
- GET list: admin sees pending + approved, non-admin → 403

**Auto-approve:**
- Request with no admin present → Celery task scheduled
- After 30s, task fires → delegate approved with `granted_by=null`
- Admin present when task fires → task is no-op
- Delegate no longer pending when task fires → task is no-op
- Requester deleted request → task is no-op

**Cleanup:**
- Webhook `room_finished` + 5min grace → non-permanent delegates deleted
- Room not empty after grace period → delegates preserved
- Permanent delegates → preserved
- Celery periodic task → delegates older than 24h deleted

**New infrastructure:**
- `list_participants` returns correct participant identities
- `send_data` delivers notification to specific participant
- Participant identity maps to user UUID

### Frontend (vitest)

- `useRecordingDelegate`: states idle/pending/granted/rejected
- `useHasRecordingAccess`: returns true for delegates
- Request button visible for authenticated non-admin, hidden for anonymous
- Recording buttons visible after granted
- Admin popup: all 3 actions work (session/permanent/reject)
- Admin fetches pending requests on room join
- 30s countdown displayed correctly during auto-approve
- Revocation removes recording buttons in real-time
