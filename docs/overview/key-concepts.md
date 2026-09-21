# Key Concepts

## Room

A **room** is a virtual meeting space. Each room has:

- A unique slug/ID used in the URL (e.g., `meet.example.com/my-room-name`)
- An owner (the user who created it) with full control
- Access level: `public` (anyone with the link joins directly), `trusted` (authenticated users join directly, others wait in the lobby), or `restricted` (everyone waits in the lobby regardless of authentication, unless explicitly trusted by the owner)
- A configuration that can include recording options, participant limits, and feature flags

Rooms are **persistent** in the database (room metadata, configuration, access rights), but **ephemeral state** (chat history, active participants, live connections) is not stored between sessions.

## Participant

A **participant** is anyone connected to a room. Participants have:

- A **role**: owner, administrator, or member
- **Media tracks**: camera video, microphone audio, and optionally screen share tracks
- **Metadata**: display name, avatar, and connection state

## LiveKit

[LiveKit](https://livekit.io/) is the Open Source WebRTC infrastructure that powers Meet's real-time media. It is a **Selective Forwarding Unit (SFU)**. Unlike an MCU (Multipoint Control Unit), an SFU does not transcode media. It receives streams from senders and selectively forwards them to receivers, which is dramatically more scalable and CPU-efficient.

Meet uses LiveKit for:

- All audio and video streaming
- Screen sharing
- In-meeting chat (via LiveKit Data Channels)
- Recording (via LiveKit Egress)
- Transcription (via LiveKit Agents)

## Token / JWT

LiveKit uses **JSON Web Tokens (JWTs)** for authentication. When a user joins a meeting:

1. The Django backend generates a short-lived JWT signed with the LiveKit API secret
2. This token encodes the user's identity, room name, and permissions
3. The client presents this token when connecting to LiveKit
4. LiveKit validates the token and grants access

Tokens are issued by the Django backend. The LiveKit server itself never needs to know about users or OIDC.

## OIDC / SSO

Meet uses **OpenID Connect (OIDC)** for user authentication. Any standards-compliant OIDC provider works:

- Keycloak (bundled in the development stack)
- ProConnect (used by French government instances)
- Authentik, Dex, Auth0, Okta, Google, etc.

OIDC handles who the user *is*. LiveKit tokens handle what the user can *do* in a room.

## Egress

**LiveKit Egress** is a LiveKit component that processes room output. Meet uses it for:

- **Room composite recording**: Records the entire room view as a video file
- **Audio-only recording**: Records room audio as a single track (used for transcription)

Egress saves output to object storage (MinIO/S3). It requires:

- Access to the LiveKit server
- Access to Redis (shared with LiveKit)
- Access to S3-compatible storage

## Celery

**Celery** is a distributed task queue used in two places:

1. **Django backend Celery worker**: Handles async tasks like file deletion cleanup. Recording notification emails are sent synchronously instead, from the LiveKit webhook handler (see below)
2. **Summary service Celery workers**: Three separate workers - transcription (`transcribe-queue-v2`), summarization (`summarize-queue-v2`), and webhook callbacks (`call-webhook-queue-v2`)

Both use Redis as the message broker.

## Object Storage (MinIO / S3)

Meet stores binary files (recordings, uploaded files) in **S3-compatible object storage**. Any S3-compatible provider works (MinIO, AWS S3, Garage, Scaleway Object Storage, OVHcloud Object Storage, etc.) - the backend only uses it to upload/download files.

Recording completion is detected via LiveKit Server's own `egress_ended` webhook and delivered to the Django backend.

## Simulcast

**Simulcast** is a WebRTC technique where a participant's browser encodes and sends the same video stream at multiple quality levels simultaneously (e.g., 1080p, 360p, 180p). LiveKit then forwards only the appropriate quality level to each receiver based on their available bandwidth. This dramatically improves quality in meetings with participants on varying network conditions.

## Room configuration

Rooms can have a **configuration** object controlling:

- Which media sources participants can publish (camera, microphone, screen sharing)
- Whether everyone can mute each other

This configuration is set by the room owner and synced to LiveKit as room metadata.
