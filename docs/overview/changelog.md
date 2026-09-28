# Changelog

This page summarizes notable releases. For the full commit-level changelog, see the [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) in the repository.

LaSuite Meet follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## 1.31.0 (2026-09-08)

### Added
- 1080p sending resolution option
- Traefik support via a configurable media-auth URL header
- External API support for updating a room's attributes
- Waiting participants sorted by arrival time

### Fixed
- Broadened allowed characters in the user `sub` field
- Sending resolution preserved while the camera is off
- Automatic lower-hand on speaking restored
- Various UI polish (Avatar initials, feedback buttons, login hint position)


## 1.30.0 (2026-09-01)

### Added
- Voxtral realtime support as an inference engine for agents
- Spanish language support
- Publish permissions exposed on the media state element

### Changed
- Removed the S3 storage-event webhook for recordings - completion is now detected solely via the LiveKit `egress_ended` webhook
- Side panel can be closed with the Escape key

### Fixed
- Chat text-area bug


## 1.29.0 (2026-08-25)

### Added
- Any authenticated user can manage the lobby on trusted rooms

### Changed
- Mobile UI improvements: collapsible control bar, stacked idle modal buttons, improved feedback screen responsiveness
- Blocking Redis `KEYS` replaced with cursor-based `SCAN` for performance


## 1.28.0 (2026-08-24)

### Added
- Analytics tracking for recording start/stop errors
- Camera-in-use failures explained on the join screen

### Changed
- Configurable S3 region for the summary service
- Increased background blur intensity

### Fixed
- Multiple device-selection and media-track stability fixes (Chrome/Windows, Firefox)
- Mute confirmation dialog and joined-notification tile rendering fixes


## 1.27.0 (2026-08-14)

### Fixed
- Control bar layout hysteresis and toolbar alignment drift
- Speaker test hardened against missing audio sinks
- Screen-share denials no longer reported as errors


## 1.26.0 (2026-08-12)

### Added
- Audio gauge on the microphone select menu and a sound tester for outputs
- Permission prompts when toggling a denied device
- Silent-microphone watcher on join and room screens

### Fixed
- Permission store regression
- Missing-device errors handled gracefully


## 1.25.2 (2026-08-06)

### Fixed
- MediaPipe assets served under a versioned, cache-friendly path


## 1.25.1 (2026-08-06)

### Fixed
- Background effects crash from a MediaPipe WASM version mismatch


## 1.25.0 (2026-08-05)

### Added
- Connection test feature
- Promoting authenticated participants; "unauthenticated" participant badge
- Configurable documentation menu item
- Default configuration settable for generated links
- Roomkit viewset to start a room without a WebRTC join

### Fixed
- Recording metadata preserved when updating room access
- Speaker assignment and summary failure-webhook detection fixes


## 1.24.0 (2026-07-21)

### Added
- Search the recording admin table by owner email
- Participant color gradient shown when camera is off
- Force SSO display name for authenticated users

### Fixed
- Info panel crash for unregistered rooms


## 1.23.0 (2026-07-08)

### Added
- Feature flags support in PostHog analytics

### Changed
- Summary service migrated fully to v2 (v1 code removed)

### Fixed
- Case-insensitive email deduplication in the user-merge command


## 1.22.0 (2026-07-03)

### Added
- Picture-in-picture tiles capped and paginated, with screen share prioritized in the layout
- Command to clean pending and deleted files (with a Helm cronjob)
- Fallback to save recordings without S3/MinIO webhooks (superseded by the full removal in 1.30.0)

### Fixed
- Unencoded S3 notification object keys now supported


## 1.21.0 (2026-06-15)

### Added
- Disable silent login or hide the login button via URL parameters
- Optional satisfaction survey footer in the summary service

### Changed
- Enhanced noise reduction (BigBlueBetterAudio/BBBA audio processing pipeline)
- Participants muted by default when joining a large meeting


## 1.20.0 (2026-06-12)

### Fixed
- Noise reduction left-channel-only audio bug


## 1.19.0 (2026-06-04)

### Added
- File-specific admin panel

### Fixed
- Files inaccessible until fully processed
- `idna` dependency upgraded to address CVE-2026-45409


## 1.18.0 (2026-06-03)

### Added
- Management command to merge duplicate user accounts (with a Helm job)

### Fixed
- Duplicate pending users on concurrent requests


## 1.17.0 (2026-05-31)

### Added
- Participants can mute others based on room configuration
- Picture-in-picture mode for meetings
- Reactions enabled on mobile devices
- New S3-compatible storage event parser (`core.recording.event.parsers.S3Parser`)
- Extended file format support in the summary service

### Changed
- Simplified source serialization
- Room configuration exposed to all API consumers
- Room configuration and access level settable via external API
- Swagger routes now prefixed with `/api`

### Fixed
- Swagger and ReDoc documentation URL regression


## 1.16.0 (2026-05-13)

### Added
- Support for multiple transcription workers and endpoints (Helm)
- Configurable recording encoding via environment variables
- Speaker-to-participant assignment in the summary service

### Changed
- Summary service tasks endpoint signature updated
- Security dependency updates (urllib3 v2.7.0)

### Fixed
- Recording start made atomic and fault-tolerant
- Room IDs now use cryptographically secure random generation
- WebM recording support completed in summary service
- Standardized role terminology across UI localizations
- Recording email download link fix


## 1.15.0 (2026-04-30)

### Added
- VAD (Voice Activity Detection), connection, and chat event metadata collection
- Add-ons authentication backend for external integrations
- Initial Microsoft Outlook add-in support (alpha)
- Setting to toggle application token exchange mechanism

### Fixed
- WebM support in the summary service
- Screen recording feature flag access control
- Reconnect loop caused by `connectionObserverStore` updates


## 1.14.0 (2026-04-16)

### Added
- Async STT and summary task routes v2
- Unit tests for `JwtTokenService`

### Changed
- Authorization header used for LiveKit token authentication
- More file extensions allowed in the summary service

### Fixed
- Critical security patches: aiohttp, Vite, Django, Pillow CVEs
- Failure webhook notification in summary service
- Participant metadata update permission enforcement


## 1.13.0 (2026-03-31)

### Changed
- Accessibility improvements: call controls region, reaction toolbar, side panel navigation

### Fixed
- Email disclosure vulnerability in room invitation endpoint
- Regression in `update-participant` endpoint


## 1.12.0 (2026-03-24)

### Changed
- Configurable `SESSION_ENGINE`
- Multiple accessibility fixes: side panel, more tools heading hierarchy, button descriptions
- Custom background upload indicator with preview
- OS-specific shortcut display in participant tile

### Fixed
- Custom background deletion state bug
- Device selection not applying during an active conference


## 1.11.0 (2026-03-19)

### Added
- Custom virtual backgrounds
- Celery support in Helm chart
- Ingress support for custom background images
- Authenticated user rate throttling
- File upload feature (disabled by default)

### Changed
- Caption text size, font, and background color settings for accessibility
- HTML `lang` attribute synchronized with i18n for screen readers


## 1.10.0 (2026-03-05)

### Added
- File upload during meetings

### Changed
- Enhanced API input validation
- Dedicated Kubernetes Ingress for LiveKit webhook


## 1.9.0 (2026-03-02)

### Added
- ARM64 platform support for Docker image builds
- Shortcut settings tab
- Skip link component for keyboard navigation

### Changed
- Replaced custom reactions toolbar with React Aria popover
- Minimum Python version bumped to 3.13
- Localized screen reader modifier key labels


## 1.8.0 (2026-02-20)

### Fixed
- OpenSSL CVE-2025-15467 in agents image
- protobuf CVE-2026-0994 pinned fix


## 1.7.0 (2026-02-19)

### Added
- Windows app web link exposed in the UI
- Additional keyboard shortcuts for accessibility


## 1.6.0 (2026-02-10)

### Added
- Scalingo PaaS deployment support
- Sentry monitoring for throttling rate failures

### Fixed
- Object-level permission checks on room endpoint
- Application validation when consuming external JWTs


## 1.5.0 (2026-01-28)

### Fixed
- XSS vulnerability on the recording download page


## 1.4.0 (2026-01-25)

### Added
- Configurable redirect for unauthenticated users

### Changed
- Multiple accessibility improvements: reactions vocalized, background announcements, back button in side panel


## 1.3.0 (2026-01-13)

### Added
- Dutch and German language support for the summary service
- User ejection explanation shown in the UI


## 1.2.0 (2026-01-05)

### Added
- Simultaneous transcription and recording start
- Transcription language selection
- Audio/video file download link alongside transcription
- Unprivileged users can request recording


## 1.1.0 (2025-12-22)

### Added
- User creation via email for external integrations
- Langfuse observability for LLM API calls in the summary service


## 1.0.1 (2025-12-17)

First broadly available stable release. Focus on accessibility and stability.


For upgrade instructions between versions, see the [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) file in the repository.
