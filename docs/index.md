# LaSuite Meet

**Open Source video conferencing, self-hostable under MIT.**

Built on [LiveKit](https://livekit.io/), LaSuite Meet delivers HD audio and video calls directly from your browser, with no plugin or client to install. It is developed by [DINUM](https://www.numerique.gouv.fr/), the French government's digital agency, and powers [Visio](https://visio.numerique.gouv.fr/), the official video platform for French public servants.

[![GitHub Stars](https://img.shields.io/github/stars/suitenumerique/meet)](https://github.com/suitenumerique/meet/stargazers/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/suitenumerique/meet/blob/main/CONTRIBUTING.md)
[![License: MIT](https://img.shields.io/github/license/suitenumerique/meet)](https://github.com/suitenumerique/meet/blob/main/LICENSE.md)
[![Matrix](https://img.shields.io/badge/chat-matrix-blue)](https://matrix.to/#/#meet-official:matrix.org)

<figure markdown="span">
  ![LaSuite Meet in action](assets/demo.gif)
  <figcaption>A meeting in LaSuite Meet</figcaption>
</figure>

## Features

- **HD audio and video** in the browser, with noise suppression and quality that adapts to each connection
- **Large meetings**, built for more than 100 participants
- **Several screen shares at once**, each one zoomable
- **Chat, emoji reactions and raised hands**, with nothing kept after the meeting, see [What is stored where](overview/how-meet-works.md#what-is-stored-where)
- **Waiting room** and three access levels, so the host decides who comes in
- **Recording** to S3-compatible storage, with the download link sent by email
- **Transcription and AI summary** *(beta)*, delivered to LaSuite Docs
- **Real-time subtitles** *(beta)*
- **Dial-in by phone** with a PIN
- **Sign-in through any OpenID Connect provider**
- **Virtual backgrounds**: blur or an image
- **Keyboard navigation and screen reader support**

Every feature is in the open source code. Meet runs on Docker Compose for a single server or on Kubernetes at scale.

## Where to start

| You want to | Read |
|---|---|
| Use Meet | [Getting Started](user/getting-started.md), then [Features & Controls](user/features-controls.md) |
| Understand how it works | [How Meet works](overview/how-meet-works.md) |
| Run your own instance | [Self-Hosting](self-hosting/index.md), which compares Docker Compose, Kubernetes and Scalingo |
| Connect another application | [External API](reference/external-api.md) |
| Change the code | [Develop locally](contributing/develop.md) |
| Look up a setting or fix a problem | [Environment Variables](reference/env-variables.md), [Troubleshooting](reference/troubleshooting.md) |

## Known public instances

| URL | Operator | Access |
|---|---|---|
| [visio.numerique.gouv.fr](https://visio.numerique.gouv.fr/) | DINUM | French central administration (ProConnect required) |
| [visio.suite.anct.gouv.fr](https://visio.suite.anct.gouv.fr/) | ANCT | French territorial administration (ProConnect required) |
| [visio.lasuite.coop](https://visio.lasuite.coop/) | lasuite.coop | Demo: test accounts from [lasuite.coop](https://lasuite.coop/applications/demo/), deleted after a month |
| [mosa.cloud](https://mosa.cloud/) | mosa.cloud | Dutch commercial instance |
| [Clever Cloud](https://www.clever.cloud/product/visio/) | Clever Cloud | Openvisio, a sovereign video conferencing offer based on LaSuite Meet |
| [Email.eu](https://email.eu/) | Email.eu | Sovereign business workspace |
| [visio.samourai.app](https://visio.samourai.app/) | Samouraï | French cooperative instance, guests join by link |

## Community and support

- **Matrix**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- **GitHub Issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
- **GitHub Discussions**: [github.com/suitenumerique/meet/discussions](https://github.com/suitenumerique/meet/discussions)
- **Roadmap**: [GitHub Projects](https://github.com/orgs/suitenumerique/projects/3/views/2)
- **Source code**: [github.com/suitenumerique/meet](https://github.com/suitenumerique/meet)

## Reporting a vulnerability

Report a security problem privately, through the [vulnerability report form](https://vdp.numerique.gouv.fr/p/Send-a-report?lang=en) or by email to `visio@numerique.gouv.fr`, never in a public issue or pull request. The maintainers fix it first, then name it in the release notes with its GitHub advisory number and, where one exists, its CVE. The full policy is [SECURITY.md](https://github.com/suitenumerique/meet/blob/main/SECURITY.md).

## License

Code is released under the **MIT License** by DINUM. Documentation in the `docs/` directory is released under the [Etalab-2.0 license](https://spdx.org/licenses/etalab-2.0.html).
