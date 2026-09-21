# Feature Matrix

## Core conferencing

| Feature | Status | Notes |
|---|---|---|
| HD video (up to 1080p) | ✅ Available | Depends on client hardware and network |
| HD audio | ✅ Available | Opus codec with noise suppression |
| Multiple simultaneous screen shares | ✅ Available | No limit on concurrent screen share streams |
| Speaker detection | ✅ Available | Automatic focus on active speaker |
| Simulcast (VP8/VP9/AV1) | ✅ Available | Automatic quality adaptation per receiver |
| SVC codecs (VP9, AV1) | ✅ Available | Better quality at lower bitrate |
| Large meetings (150+ participants) | ✅ Available | Tested in production at national scale |
| Participant pinning | ✅ Available | Pin any participant to the primary view |
| Picture-in-picture | ✅ Available (v1.17.0+) | Detach the meeting into a floating mini-window while using other browser tabs |
| Push-to-talk | ✅ Available | Hold `V` to unmute |
| Noise reduction | ✅ Available (v1.21.0+) | RNNoise-based noise suppression via `@libreaudio/la-call` |

## Communication

| Feature | Status | Notes |
|---|---|---|
| In-meeting chat | ✅ Available | Non-persistent; clears when meeting ends |
| Emoji reactions | ✅ Available | Configurable, screen-reader friendly, available on mobile (v1.17.0+) |
| Hand raise / queue | ✅ Available | Visible to all participants |

## Security & access control

| Feature | Status | Notes |
|---|---|---|
| OIDC / SSO authentication | ✅ Available | Any standards-compliant OIDC provider |
| Room access control (owner/administrator/member) | ✅ Available | Three role levels |
| Lobby / waiting room | ✅ Available | Host must admit participants |
| End-to-end encryption | 🔜 Coming soon | - |
| Participant ejection | ✅ Available | By room owner/administrator |
| Rate limiting | ✅ Available | Configurable via backend settings |
| Silent login | ✅ Available (v1.21.0+) | Automatic login attempt with `prompt=none`; can be disabled via URL parameter |

## Recording & transcription

| Feature | Status | Notes |
|---|---|---|
| Meeting recording | ✅ Available | Requires LiveKit Egress + S3 storage |
| Recording download | ✅ Available | Secure link sent to room owner |
| Transcription (STT) | ⚗️ Beta | Requires Summary service + WhisperX API. Pushing the transcript to a LaSuite Docs instance is optional. |
| AI meeting summary | ⚗️ Beta | Requires Summary service + LLM API |
| Simultaneous recording + transcription | ✅ Available (v1.2.0+) | Can be started together from the UI |
| Transcription language selection | ✅ Available | Multiple languages supported |
| Audio/video file download | ✅ Available | Alongside transcription download |

## Accessibility

| Feature | Status | Notes |
|---|---|---|
| Keyboard navigation | ✅ Available | Full keyboard control of all UI elements |
| Screen reader support | ✅ Available | Actively maintained with live region announcements |
| Real-time captions | ⚗️ Beta | Via LiveKit agents with Deepgram, Kyutai Moshi, or Voxtral STT models; under active development |
| Configurable caption font size | ✅ Available | |
| Caption font and background color | ✅ Available | |
| Reduced motion support | ✅ Available | Respects `prefers-reduced-motion` |
| High contrast support | ✅ Available | Respects system contrast settings |
| Skip links | ✅ Available | Keyboard users can skip navigation |
| Shortcut settings | ✅ Available | Configurable keyboard shortcuts (`Ctrl+Shift+/`) |

## Customization & integration

| Feature | Status | Notes |
|---|---|---|
| Custom virtual backgrounds | ✅ Available | Upload custom images |
| Customizable branding / CSS | ✅ Available | Runtime: `FRONTEND_CUSTOM_CSS_URL` + asset volume mount. Title change requires a custom Docker build (`VITE_APP_TITLE` build arg). |
| Telephony / SIP integration | ✅ Available | Via LiveKit SIP bridge |
| Roomkit (meeting-room hardware) | ⚗️ Beta | Server-to-server API letting SIP-based meeting-room devices join by PIN code before any browser participant connects. Backend-only, no frontend. Disabled by default (`ROOMKIT_ENABLED`) - see [Environment Variables](../reference/env-variables.md#roomkit-meeting-room-sip-devices). |
| External API authentication | ✅ Available | Multiple modes: Application JWT (token exchange), Add-on JWT (calendar integrations), OIDC Resource Server |
| Microsoft Outlook add-in | ✅ Available  | Introduced in v1.15.0; i18n support added in v1.20.0 |
| Calendars (La Suite) integration | ✅ Available | Events include a Visio link; set `FRONTEND_MEET_BASE_URL` in Calendars backend |
| Configurable redirect for unauthenticated users | ✅ Available | Useful for setting a custom homepage or landing page before authentication |

## Deployment

| Method | Support level |
|---|---|
| Docker Compose | Officially documented - full step-by-step guide with recording support |
| Kubernetes / Helm | Officially supported (production) |
| Scalingo PaaS | Officially supported |
| Nix | Community (unstable) |
| YunoHost | Community (small instances only, under construction) |

## Version history highlights

| Version | Date | Key additions |
|---|---|---|
| v1.31.0 | 2026-09-08 | 1080p sending resolution option, Traefik support via media-auth header, external API room-attribute updates |
| v1.30.0 | 2026-09-01 | **Removed the S3 storage-event webhook for recordings** - completion now detected solely via the LiveKit `egress_ended` webhook, Spanish language support |
| v1.29.0 | 2026-08-25 | Lobby management opened to any authenticated user on trusted rooms, mobile UI improvements |
| v1.28.0 | 2026-08-24 | Recording error analytics, configurable summary service S3 region |
| v1.27.0 | 2026-08-14 | Control bar and toolbar layout stability fixes |
| v1.26.0 | 2026-08-12 | Audio gauge and sound tester for device selection, silent-microphone watcher |
| v1.25.0 | 2026-08-05 | Connection test feature, promoting authenticated participants, roomkit viewset |
| v1.24.0 | 2026-07-21 | Participant color gradients, force SSO display name, search recordings by owner email, Outlook add-in improvements |
| v1.23.0 | 2026-07-08 | Feature flags (PostHog), Sentry error reporting for agents, Python 3.14 upgrade for agents |
| v1.22.0 | 2026-07-03 | Picture-in-picture pagination, recording fallback without S3 webhooks, screen share in PiP |
| v1.21.0 | 2026-06-15 | **RNNoise-based noise reduction**, silent login, auto-mute in large meetings, hide login button option |
| v1.20.0 | 2026-06-12 | Outlook add-in i18n support, noise reduction bug fixes |
| v1.17.0 | 2026-05-31 | Picture-in-picture, reactions on mobile, mute others by room config, S3Parser for recording storage events |
| v1.16.0 | 2026-05-13 | Configurable recording encoding, multiple transcription workers (Helm), speaker-to-participant assignment |
| v1.15.0 | 2026-04-30 | VAD metadata collection, Microsoft Outlook add-in (alpha), add-ons authentication |
| v1.11.0 | 2026-03-19 | Custom backgrounds, Celery support in Helm, file upload |
| v1.0.1 | 2025-12-17 | First stable release, accessibility pass |
