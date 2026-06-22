# LaSuite Meet

**Open Source video conferencing, self-hostable under MIT.**

Built on [LiveKit](https://livekit.io/), LaSuite Meet delivers HD audio and video calls directly from your browser. Used in production by DINUM to power [Visio](https://visio.numerique.gouv.fr/), the official video platform for French public servants.

[![GitHub Stars](https://img.shields.io/github/stars/suitenumerique/meet)](https://github.com/suitenumerique/meet/stargazers/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/suitenumerique/meet/blob/main/CONTRIBUTING.md)
[![License: MIT](https://img.shields.io/github/license/suitenumerique/meet)](https://github.com/suitenumerique/meet/blob/main/LICENSE)
[![Matrix](https://img.shields.io/badge/chat-matrix-blue)](https://matrix.to/#/#meet-official:matrix.org)

![LaSuite Meet in action](assets/demo.gif)

## Features

- **HD video and audio**: noise suppression, adaptive bitrate, Opus codec
- **Large meetings**: tested at national scale with 100+ participants
- **Multiple screen shares**: any number of participants can share simultaneously
- **Non-persistent chat**: history is cleared when the meeting ends
- **Emoji reactions & hand raise**: without unmuting
- **Meeting recording**: stored to S3-compatible storage; download link sent by email
- **Transcription & AI summary** *(beta)*: speech-to-text with optional LLM summarization
- **Telephony / SIP**: dial-in and dial-out support
- **OIDC / SSO**: Keycloak, Authentik, Google, Microsoft, ProConnect
- **Virtual backgrounds**: blur or custom image, uploadable
- **Lobby / waiting room**: host controls who enters
- **Full keyboard navigation and screen reader support** (WCAG)

---

## Using Meet

- [Getting started](user/getting-started.md)
- [Features & Controls](user/features-controls.md)
- [Settings](user/settings.md)
- [Recording](user/recording.md)
- [AI Transcription](user/transcription.md)
- [FAQ](faq.md)

## Self-hosting

### Docker Compose

Single-server deployment, no Kubernetes required.

- [Quick Start](self-hosting/compose/quick-start.md)
- [Full deployment guide](self-hosting/compose/deployment-guide.md)
- [Recording](self-hosting/configuration/recording.md)

### Kubernetes / High-Availability

For production and high-availability deployments.

1. [Prerequisites](self-hosting/kubernetes/prerequisites.md)
2. [Helm deployment](self-hosting/kubernetes/helm.md)
3. [Recording](self-hosting/configuration/recording.md)

### Scalingo
1. [Deploy with Scalingo](self-hosting/scalingo.md)

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

## Reference

- [Architecture overview](overview/architecture.md)
- [Environment variables](reference/env-variables.md)
- [API reference](reference/api.md)
- [Troubleshooting](reference/troubleshooting.md)

## Community and support

- **Matrix**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- **GitHub Issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
- **GitHub Discussions**: [github.com/suitenumerique/meet/discussions](https://github.com/suitenumerique/meet/discussions)
- **Source code**: [github.com/suitenumerique/meet](https://github.com/suitenumerique/meet)
