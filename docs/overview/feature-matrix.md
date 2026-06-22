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
| Large meetings (100+ participants) | ✅ Available | Tested in production at national scale |
| Participant pinning | ✅ Available | Pin any participant to the primary view |
| Picture-in-picture | ✅ Available (v1.17.0+) | Detach the meeting into a floating mini-window while using other browser tabs |
| Push-to-talk | ✅ Available | Hold `V` to unmute |

## Communication

| Feature | Status | Notes |
|---|---|---|
| In-meeting chat | ✅ Available | Non-persistent; clears when meeting ends |
| Emoji reactions | ✅ Available | Configurable, screen-reader friendly, available on mobile (v1.17.0+) |
| Hand raise / queue | ✅ Available | Visible to all participants |
| File sharing | ✅ Available | Upload files during a meeting; disabled by default |

## Security & access control

| Feature | Status | Notes |
|---|---|---|
| OIDC / SSO authentication | ✅ Available | Any standards-compliant OIDC provider |
| Room access control (owner/administrator/member) | ✅ Available | Three role levels |
| Lobby / waiting room | ✅ Available | Host must admit participants |
| End-to-end encryption | 🔜 Coming soon | - |
| Participant ejection | ✅ Available | By room owner/administrator |
| Rate limiting | ✅ Available | Configurable via backend settings |

## Recording & transcription

| Feature | Status | Notes |
|---|---|---|
| Meeting recording | ✅ Available | Requires LiveKit Egress + S3 storage |
| Recording download | ✅ Available | Secure link sent to room owner |
| Transcription (STT) | ⚗️ Beta | Requires Summary service + WhisperX API + LaSuite Docs instance |
| AI meeting summary | ⚗️ Beta | Requires Summary service + LLM API |
| Simultaneous recording + transcription | ✅ Available (v1.2.0+) | Can be started together from the UI |
| Transcription language selection | ✅ Available | Multiple languages supported |
| Audio/video file download | ✅ Available | Alongside transcription download |

## Accessibility

| Feature | Status | Notes |
|---|---|---|
| Keyboard navigation | ✅ Available | Full keyboard control of all UI elements |
| Screen reader support | ✅ Available | Actively maintained with live region announcements |
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
| External JWT authentication | ✅ Available | For embedding in third-party apps |
| Microsoft Outlook add-in | 🚧 Alpha | Introduced in v1.15.0 |
| Calendars (La Suite) integration | ✅ Available | Events include a Visio link; set `FRONTEND_MEET_BASE_URL` in Calendars backend |
| Configurable redirect for unauthenticated users | ✅ Available | |

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
| v1.17.0 | 2026-05-31 | Picture-in-picture, reactions on mobile, mute others by room config, S3Parser for recording storage events |
| v1.16.0 | 2026-05-13 | Configurable recording encoding, multiple transcription workers (Helm), speaker-to-participant assignment |
| v1.15.0 | 2026-04-30 | VAD metadata collection, Microsoft Outlook add-in (alpha), add-ons authentication |
| v1.14.0 | 2026-04-16 | Async STT/summary routes v2, accessibility improvements, security patches |
| v1.11.0 | 2026-03-19 | Custom backgrounds, Celery support in Helm, file upload |
| v1.10.0 | 2026-03-05 | File upload feature, API input validation hardening |
| v1.9.0 | 2026-03-02 | ARM64 platform support, shortcut settings tab, skip links |
| v1.2.0 | 2026-01-05 | Simultaneous transcription + recording, language selection |
| v1.0.1 | 2025-12-17 | First stable release, accessibility pass |
