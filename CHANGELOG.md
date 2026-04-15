# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ✨(backend) add metadata collection of VAD, connection and chat events
- ✨(backend) introduce add-ons authentication backend

### Fixed

- 🐛(summary) support webm #1290
- ⬆️(backend) bump django-lasuite to v0.0.26
- 🩹(frontend) use a more standard (quality) rating scale

## [1.14.0] - 2026-04-16

### Added

- 🔒️(helm) Add pod and container securityContext #1197
- ✨(summary) add routes v2 for async STT and summary tasks #1171
- ✅(backend) add unit tests for JwtTokenService #1232

### Changed

- ⬆️(backend) bump lodash from 4.17.23 to 4.18.1 in /src/mail
- ⬆️(frontend) bump hono from 4.12.8 to 4.12.12 in /src/frontend
- ⬆️(backend) bump pygments from 2.19.2 to 2.20.0 in /src/backend
- ♻️(backend) use Authorization header for LiveKit token authentication
- 🥅(backend) refine Twirp error handling for participant operations
- ✨(summary) allow more file extensions #1265
- ♿️(frontend) refocus reactions toolbar with ctrl+shift+e is activated #1262
- ♿️(frontend) set an explicit document title on recording download page #1261

### Fixed

- ⬆️(dependencies) update aiohttp to v3.13.4 [SECURITY]
- ⬆️(dependencies) update vite to v7.3.2 [SECURITY]
- ⬆️(dependencies) update django to v5.2.13 [SECURITY]
- 🔒(backend) rely on backend to allow participant update their metadata
- 🐛(summary) fix failure webhook notification #1233
- 🐛(summary) relax whisperX payload format #1233
- ⬆️(backend) upgrade dependencies to fix Pillow CVE-2026-40192
- ⬆️(frontend) upgrade frontend image to Alpine 3.23 to address CVEs

## [1.13.0] - 2026-03-31

### Changed

- ⬆️(dependencies) update python dependencies
- ♿️(frontend) add explicit region for call controls #1216
- ♿️(frontend) improve accessibility of the reaction toolbar #1216
- ♿️(frontend) enhance sidepanel navigation accessibility #1216

### Fixed

- 🔒️(backend) fix email disclosure in room invitation endpoint #1200
- 🐛(backend) fix regression in update-participant endpoint #1204

## [1.12.0] - 2026-03-24

### Changed

- ♻️(backend) configurable SESSION_ENGINE #1038 #1154
- ♿️(frontend) fix sidepanel accessibility aria-label #1182
- ♿️(frontend) fix more tools heading hierarchy #1181
- ♿️(fronted) improve button descriptions for More tools actions #1184
- 💄(spinner) enforce spinner height #1183
- 💄(custom-background) add upload indicator with preview #1183
- ♿️(backend) improve logo accessibility in recording email notification #1092
- ♿️(summary) improve accessibility of transcription download link #1187
- 💄(frontend) show OS-specific shortcut in participant tile hint #1193
- ⬆️(frontend) bump flatted from 3.3.1 to 3.4.2 in /src/frontend #1188
- ⬆️️️(frontend) bump undici from 6.23.0 to 6.24.1 in /src/frontend
- ⬆️️️(frontend) bump hono from 4.12.2 to 4.12.7 in /src/frontend
- ⬆️️️(frontend) bump dompurify from 3.3.1 to 3.3.2 in /src/frontend

### Fixed

- 🐛(frontend) disable personal custom background while deleting #1183
- 🐛(frontend) auto-select new custom background when not logged in #1183
- 🐛(frontend) fix device selection not applying during conference #1156

## [1.11.0] - 2026-03-19

### Added

- ✨(helm) support celery with our Django backend #1124
- ✨(helm) support ingress for custom background image #1124
- ✨(backend) add authenticated user rate throttling on request-entry #1129
- ✨(backend) expose `is_active` field for Application in Django admin #1133
- ✨(file-upload) disable by default & limit count by user #1141
- ✨(frontend) custom background #1067

### Changed

- ♿️(frontend) Caption text size setting for accessibility #1062
- ♿️(frontend) sync html lang attribute with i18n for screen readers #1111
- ♿️(frontend) improve MoreLink a11y and UX on home page #1112
- ♿️(frontend) improve chat toast a11y for screen readers #1109
- ♿️(frontend) improve ui and aria labels for help article links #1108
- 🌐(frontend) improve German translation #1125
- 🔨(python-env) migrate meet main app to UV #1120
- ♻️(backend) align Application model field with `is_active` convention #1133
- 🔐(backend) avoids revealing the inactive status of an application #1135
- ⚡️(helm) reduce initialDelaySeconds and add periods seconds #1139
- 🔒️(backend) avoid information exposure through exception messages #1144
- ⬆️(dependencies) update PyJWT to v2.12.0 [SECURITY] #1151
- 📌(agents) unpin OpenSSL and related dependencies #1167
- ♿️(frontend) add caption font and background color customization #1122

### Fixed

- 🐛(frontend) fix hand icon and queue position alignment and position #1119
- 🩹(backend) add page_size to pagination for room endpoints #1131
- 🐛(backend) refactor lobby throttling to use participant id #1129
- 🩹(backend) ignore non-recording uploads in storage webhook handler #1142
- 🐛(frontend) fix dimension mismatch in BackgroundCustomProcessor #1116

## [1.10.0] - 2026-03-05

### Changed

- 🔒️(backend) enhance API input validation to strengthen security #1053
- 🦺(backend) strengthen API validation for recording options #1063
- ⚡️(frontend) optimize few performance caveats #1073
- 🔒️(helm) introduce a dedicated Kubernetes Ingress for webhook-livekit #1066
- ⬆️(deps) bump rollup from 4.44.2 to 4.59.0 in /src/frontend #1088

### Fixed

- 🐛(migrations) use settings in migrations #1058
- 💄(frontend) truncate pinned participant name with ellipsis on overflow #1056
- ♿(frontend) prevent focus ring clipping on invite dialog #1078
- ♿(frontend) dynamic tab title when connected to meeting #1060
- 🩹(frontend) remove incorrect reference to ProConnect on the prejoin #1080
- ✨(frontend) add Ctrl+Shift+/ to open shortcuts settings #1050
- ♿(frontend) announce selected state to screen readers #1081
- 💄(frontend) truncate long names with ellipsis in reaction overlay #1099

### Added

- ✨(backend) add file upload feature #1030

## [1.9.0] - 2026-03-02

### Added

- 👷(docker) add arm64 platform support for image builds
- ✨(summary) add localization support for transcription context text

### Changed

- ♻️(frontend) replace custom reactions toolbar with react aria popover #985
- 🔒️(frontend) uninstall curl from the frontend production image #987
- 💄(frontend) add focus ring to reaction emoji buttons
- ✨(frontend) introduce a shortcut settings tab #975
- 🚚(frontend) rename "wellknown" directory to "well-known" #1009
- 🌐(frontend) localize SR modifier labels #1010
- ⬆️(backend) update python dependencies #1011
- ♿️(frontend) fix focus ring on tab container components #1012
- ♿️(frontend) upgrade join meeting modal accessibility #1027
- ⬆️(python) bump minimal required python version to 3.13 #1033
- ♿️(frontend) improve accessibility of the IntroSlider carousel #1026
- ♿️(frontend) add skip link component for keyboard navigation #1019
- ♿️(frontend) announce mic/camera state to SR on shortcut toggle #1052

### Fixed

- 🩹(frontend) fix German language preference update #1021

## [1.8.0] - 2026-02-20

### Changed

- 🔒️(agents) uninstall pip from the agents image
- 🔒️(summary) switch to Alpine base image
- 🔒️(backend) uninstall pip in the production image

### Fixed

- 🔒️(agents) upgrade OpenSSL to address CVE-2025-15467
- 📌(agents) pin protobuf to 6.33.5 to fix CVE-2026-0994

## [1.7.0] - 2026-02-19

### Added

- ✨(frontend) expose Windows app web link #976
- ✨(frontend) support additional shortcuts to broaden accessibility

### Changed

- ✨(frontend) add clickable settings general link in idle modal #974
- ♻️(backend) refactor external API token-related items #1006

## [1.6.0] - 2026-02-10

### Added

- ✨(backend) monitor throttling rate failure through sentry #964
- 🚀(paas) add PaaS deployment scripts, tested on Scalingo #957

### Changed

- ♿️(frontend) improve spinner reduced‑motion fallback #931
- ♿️(frontend) fix form labels and autocomplete wiring #932
- 🥅(summary) catch file-related exceptions when handling recording #944
- 📝(frontend) update legal terms #956
- ⚡️(backend) enhance django admin's loading performance #954
- 🌐(frontend) add missing DE translation for accessibility settings

### Fixed

- 🔐(backend) enforce object-level permission checks on room endpoint #959
- 🔒️(backend) add application validation when consuming external JWT #963

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
