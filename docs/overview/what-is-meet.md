# What is LaSuite Meet?

LaSuite Meet is an Open Source video conferencing application developed by [DINUM](https://www.numerique.gouv.fr/) (Direction interministérielle du numérique), the French government's digital agency. It powers **Visio**, the official video conferencing platform deployed to all French public servants.

Built on [LiveKit](https://livekit.io/), Meet delivers high-quality, low-latency audio and video entirely from the browser. No plugin or client installation required.

## Why Meet

Most video conferencing solutions are either proprietary (Zoom, Teams, Google Meet) or Open Source but difficult to self-host and scale (Jitsi, BigBlueButton). Meet is a modern solution which aims to be the best of both worlds:

- **Production-grade quality**: used at national scale by millions of French public servants
- **Fully open source**: MIT license, all features remain open
- **Self-hostable**: Docker Compose for small deployments, Kubernetes for production scale
- **No vendor lock-in**: you own your data, your infrastructure, your instance

## Features

| Feature | Status |
|---|---|
| HD video and audio | ✅ Available |
| Multiple simultaneous screen sharing | ✅ Available |
| Meeting recording | ✅ Available |
| Transcription & AI summary | ⚗️ Beta |
| Telephony / SIP integration | ✅ Available |
| Large meetings (100+ participants) | ✅ Available |
| OIDC / SSO authentication | ✅ Available |
| Accessibility (WCAG) | ✅ Actively maintained |
| End-to-end encryption | 🔜 Coming soon |

- [Full feature list with status and configuration notes](feature-matrix.md)

## Key technical advantages

Meet inherits all of LiveKit's media optimizations:

- **Simulcast**: clients send multiple video quality levels simultaneously; the server forwards only what each receiver can handle
- **SVC codecs**: VP9 and AV1 with spatial and temporal scalability
- **Selective subscription**: participants only receive streams they are viewing
- **Speaker detection**: automatic camera focus on the active speaker
- **End-to-end optimizations**: adaptive bitrate, packet loss recovery, jitter buffering

## Known public instances

| URL | Operator | Access |
|---|---|---|
| [visio.numerique.gouv.fr](https://visio.numerique.gouv.fr/) | DINUM | French central administration (ProConnect required) |
| [visio.suite.anct.gouv.fr](https://visio.suite.anct.gouv.fr/) | ANCT | French territorial administration (ProConnect required) |
| [visio.lasuite.coop](https://visio.lasuite.coop/) | lasuite.coop | Open demo. Accounts reset monthly |
| [mosa.cloud](https://mosa.cloud/) | mosa.cloud | Dutch commercial instance |

## License

Code is released under the **MIT License** by DINUM. Documentation in the `docs/` directory is released under the [Etalab-2.0 license](https://spdx.org/licenses/etalab-2.0.html).

## Community

- **Matrix**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- **GitHub Issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
- **Roadmap**: [GitHub Projects](https://github.com/orgs/suitenumerique/projects/3/views/2)
