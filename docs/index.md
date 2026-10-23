# LaSuite Meet

**Open Source video conferencing, self-hostable under MIT.**

Built on [LiveKit](https://livekit.io/), LaSuite Meet delivers HD audio and video calls directly from your browser, with no plugin or client to install. It is developed by [DINUM](https://www.numerique.gouv.fr/), the French government's digital agency, and powers [Visio](https://visio.numerique.gouv.fr/), the official video platform for French public servants.

[![GitHub Stars](https://img.shields.io/github/stars/suitenumerique/meet)](https://github.com/suitenumerique/meet/stargazers/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/suitenumerique/meet/blob/main/CONTRIBUTING.md)
[![License: MIT](https://img.shields.io/github/license/suitenumerique/meet)](https://github.com/suitenumerique/meet/blob/main/LICENSE)
[![Matrix](https://img.shields.io/badge/chat-matrix-blue)](https://matrix.to/#/#meet-official:matrix.org)

![LaSuite Meet in action](assets/demo.gif)

## Why Meet

Most video conferencing solutions are either proprietary (Zoom, Teams, Google Meet) or Open Source but difficult to self-host and scale (Jitsi, BigBlueButton). Meet is Open Source and built to self-host at scale:

- **Production-grade quality**: used at national scale by millions of French public servants
- **Fully open source**: MIT license, all features remain open
- **Self-hostable**: Docker Compose for small deployments, Kubernetes for production scale
- **No vendor lock-in**: you own your data, your infrastructure, your instance

## Features

- **HD video and audio**: noise suppression, adaptive bitrate, Opus codec
- **Large meetings**: tested in production with 150+ participants
- **Multiple screen shares**: any number of participants can share simultaneously
- **Non-persistent chat**: history is cleared when the meeting ends, with [one exception](faq.md#is-chat-history-stored)
- **Emoji reactions & hand raise**: without unmuting
- **Meeting recording**: stored to S3-compatible storage; download link sent by email
- **Transcription & AI summary** *(beta)*: speech-to-text with optional LLM summarization
- **Telephony / SIP**: dial in by phone with a PIN
- **OIDC / SSO**: Keycloak, Authentik, Google, Microsoft, ProConnect
- **Virtual backgrounds**: blur or custom image, uploadable
- **Lobby / waiting room**: host controls who enters
- **Full keyboard navigation and screen reader support** (WCAG)

Where each one is, who can use it, and what the instance must enable: [Features & Controls](user/features-controls.md).

---

## Using Meet

- [Getting started](user/getting-started.md)
- [Features & Controls](user/features-controls.md)
- [Settings](user/settings.md)
- [Recording](user/recording.md)
- [AI Transcription](user/transcription.md)
- [FAQ](faq.md)

## Self-hosting

Docker Compose for a single server, Kubernetes for high availability, or Scalingo: [Self-Hosting](self-hosting/index.md) compares them and lists what each needs.

## Contributing

- [Repository structure](contributing/repo-structure.md)
- [Local development setup](contributing/local-dev.md)
- [Backend development](contributing/backend.md)
- [Frontend development](contributing/frontend.md)
- [Pull requests](contributing/pull-requests.md)

---

## Known public instances

| URL | Operator | Access |
|---|---|---|
| [visio.numerique.gouv.fr](https://visio.numerique.gouv.fr/) | DINUM | French central administration (ProConnect required) |
| [visio.suite.anct.gouv.fr](https://visio.suite.anct.gouv.fr/) | ANCT | French territorial administration (ProConnect required) |
| [visio.lasuite.coop](https://visio.lasuite.coop/) | lasuite.coop | Open demo, accounts reset monthly |
| [mosa.cloud](https://mosa.cloud/) | mosa.cloud | Dutch commercial instance |
| [Clever Cloud](https://www.clever.cloud/product/visio/) | Clever Cloud | Openvisio, a sovereign video conferencing offer based on LaSuite Meet |
| [Email.eu](https://email.eu/) | Email.eu | Sovereign business workspace |
| [visio.samourai.app](https://visio.samourai.app/) | Samouraï | French cooperative instance, guests join by link |

## Reference

- [How Meet works](overview/how-meet-works.md)
- [Environment variables](reference/env-variables.md)
- [API reference](reference/api.md)
- [Troubleshooting](reference/troubleshooting.md)

## Community and support

- **Matrix**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- **GitHub Issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
- **GitHub Discussions**: [github.com/suitenumerique/meet/discussions](https://github.com/suitenumerique/meet/discussions)
- **Roadmap**: [GitHub Projects](https://github.com/orgs/suitenumerique/projects/3/views/2)
- **Source code**: [github.com/suitenumerique/meet](https://github.com/suitenumerique/meet)

## License

Code is released under the **MIT License** by DINUM. Documentation in the `docs/` directory is released under the [Etalab-2.0 license](https://spdx.org/licenses/etalab-2.0.html).
