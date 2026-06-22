# Changelog

This page summarizes notable releases. For the full commit-level changelog, see the [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) in the repository.

LaSuite Meet follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
