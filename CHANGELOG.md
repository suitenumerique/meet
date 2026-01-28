# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-01-28

### Changed

- ♿️(frontend) adjust visual-only tooltip a11y labels #910
- ♿️(frontend) sr pin/unpin announcements with dedicated messages #898
- ♿(frontend) adjust sr announcements for idle disconnect timer #908
- ♿️(frontend) add global screen reader announcer#922

### Fixed

- 🔒️(frontend) fix an XSS vulnerability on the recording page #911

## [1.4.0] - 2026-01-25

### Added

- ✨(frontend) add configurable redirect for unauthenticated users #904

### Changed

- ♿️(frontend) add accessible back button in side panel #881
- ♿️(frontend) improve participants toggle a11y label #880
- ♿️(frontend) make carousel image decorative #871
- ♿️(frontend) reactions are now vocalized and configurable #849
- ♿️(frontend) improve background effect announcements #879
- 🐛(brevo) use django-lasuite for marketing management #885

### Fixed

- 🔒(backend) prevent automatic upgrade setuptools
- ♿(frontend) improve contrast for selected options #863
- ♿️(frontend) announce copy state in invite dialog #877
- 📝(frontend) align close dialog label in rooms locale #878
- 🩹(backend) use case-insensitive email matching in the external api #887
- 🐛(frontend) ensure transcript segments are sorted by their timestamp #899
- 🐛(frontend) scope scrollbar gutter override to video rooms #882

## [1.3.0] - 2026-01-13

### Added

- ✨(summary) add dutch and german languages
- 🔧(agents) make Silero VAD optional
- 🚸(frontend) explain to a user they were ejected

### Changed

- 📈(frontend) track new recording's modes
- ♿️(frontend) improve accessibility of the background and effects menu
- ♿️(frontend) improve SR and focus for transcript and recording #810
- 💄(frontend) adjust spacing in the recording side panels
- 🚸(frontend) remove the default comma delimiter in humanized durations

### Fixed

- 🐛(frontend) remove unexpected F2 tooltip when clicking video screen
- 🩹(frontend) icon font loading to avoid text/icon flickering

## [1.2.0] - 2026-01-05

### Added

- ✨(agent) support Kyutai client for subtitle
- ✨(all) support starting transcription and recording simultaneously
- ✨(backend) persist options on a recording
- ✨(all) support choosing the transcription language
- ✨(summary) add a download link to the audio/video file
- ✨(frontend) allow unprivileged users to request a recording

### Changed

- 🚸(frontend) remove the beta badge
- ♻️(summary) extract file handling in a robust service
- ♻️(all) manage recording state on the backend side

## [1.1.0] - 2025-12-22

### Added

- ✨(backend) enable user creation via email for external integrations
- ✨(summary) add Langfuse observability for LLM API calls

## [1.0.1] - 2025-12-17

### Changed

- ♿(frontend) improve accessibility:
- ♿️(frontend) hover controls, focus, SR #803
- ♿️(frontend) change ptt keybinding from space to v #813
- ♿(frontend) indicate external link opens in new window on feedback #816
- ♿(frontend) fix heading level in modal to maintain semantic hierarchy #815
- ♿️(frontend) Improve focus management when opening and closing chat #807
