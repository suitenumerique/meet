<p align="center">
  <img alt="meet logo" src="./docs/assets/banner-meet-fr.png" maxWidth="100%">
</p>

<p align="center">
  <a href="https://github.com/suitenumerique/meet/stargazers/">
    <img src="https://img.shields.io/github/stars/suitenumerique/meet" alt="">
  </a>
  <a href='http://makeapullrequest.com'><img alt='PRs Welcome' src='https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=shields'/></a>
  <img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/suitenumerique/meet"/>
  <img alt="GitHub closed issues" src="https://img.shields.io/github/issues-closed/suitenumerique/meet"/>
  <a href="https://github.com/suitenumerique/meet/blob/main/LICENSE">
    <img alt="GitHub closed issues" src="https://img.shields.io/github/license/suitenumerique/meet"/>
  </a>
</p>

<p align="center">
  <a href="https://livekit.io/">LiveKit</a> - <a href="https://matrix.to/#/#meet-official:matrix.org">Chat with us</a> - <a href="https://github.com/orgs/suitenumerique/projects/3/views/2">Roadmap</a> - <a href="https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md">Changelog</a> - <a href="https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md">Bug reports</a>
</p>

<p align="center">
  <a href="https://visio.numerique.gouv.fr/">
    <img src="https://github.com/user-attachments/assets/09c1faa1-de88-4848-af3a-6fbe793999bf" alt="La Suite Meet Demonstration">
  </a>
</p>

## La Suite Meet: Simple Video Conferencing

Powered by [LiveKit](https://livekit.io/), La Suite Meet offers Zoom-level performance with high-quality video and audio. No installation required—simply join calls directly from your browser. Check out LiveKit's impressive optimizations in their [blog post](https://blog.livekit.io/livekit-one-dot-zero/).

### Features

- Optimized for stability in large meetings (+100 p.)
- Support for multiple screen sharing streams
- Non-persistent, secure chat
- End-to-end encryption with passphrase-in-link key distribution
- Meeting recording
- Meeting transcription & Summary (currently in beta)
- Telephony integration
- Secure participation with robust authentication and access control
- Customizable frontend style
- LiveKit Advances features including :
  - speaker detection
  - simulcast
  - end-to-end optimizations
  - selective subscription
  - SVC codecs (VP9, AV1)

### End-to-end encryption

La Suite Meet supports end-to-end encryption (E2EE) for meetings, so the media server (LiveKit SFU) cannot read audio, video or screen-share content.

#### How it works

- Each encrypted meeting carries a 48-character hex passphrase appended to the URL hash (`#…`) — 192 bits of entropy. The server never sees it; sharing the meeting link shares the key.
- Frames are encrypted in the browser via LiveKit's Worker + `crypto.subtle` (AES-GCM); only the media payload is encrypted, codec headers stay clear so the SFU can still packetize RTP.
- The runtime "is this call encrypted?" decision keys off the URL hash, not the database flag. The DB column (`Room.encryption_mode`) is only used as a sanity reference: if the URL hash and the server's claim disagree, the joining client surfaces an explicit mismatch screen instead of silently joining in clear or in a private encrypted bubble.

> **Threat model.** "Server doesn't see plaintext" — not "users are safe from a malicious server." A compromised server could still serve modified JavaScript to a participant, who would then leak their passphrase. The E2EE story protects the media path against a passive or compromised SFU, not against a fully compromised origin.

#### Encryption mode is set at creation, immutable after

`Room.encryption_mode` is a string enum (`none` / `basic`) chosen when the room is created and never mutated afterwards — changing it would change the link's semantics, since the passphrase lives in the URL hash. There is no mid-call "pause encryption" mechanism: while a meeting is encrypted, **recording and transcription endpoints reject requests with a 400** (`Recording is unavailable in encrypted rooms.` / `Subtitles are unavailable in encrypted rooms.`), the More-tools panel renders those items disabled with an explanatory banner, and the SIP gateway never gets a dispatch rule for encrypted rooms (so dial-in numbers and PINs aren't allocated). Encrypted rooms are also force-locked to `restricted` access level (lobby admission), since basic E2EE only meaningfully protects against passive eavesdropping if the host vets joiners before they receive the in-URL key.

#### Opt-in by user

End-to-end encryption is a per-user preference. In **Settings**, under the **Security** section, signed-in users can flip the **End-to-end encryption** toggle — once enabled, a third "Create an encrypted meeting" entry appears in the home-page create-menu (with its own confirmation modal that lists the disabled features and a "Treat this link like a password" connection-details dialog before the meeting starts). Joining is unaffected by the toggle: any participant clicking a meeting link that carries a valid hash joins encrypted, regardless of their own setting. Authenticated joiners of encrypted rooms cannot edit their displayed name — the server enforces the OIDC name on the JWT.

#### Configuration

```env
ENCRYPTION_ENABLED=true
```

Setting `ENCRYPTION_ENABLED=false` rejects encrypted-room creation at the API level. Existing encrypted rooms stay encrypted (the mode is immutable), but no new ones can be created.

La Suite Meet is fully self-hostable and released under the MIT License, ensuring complete control and flexibility. It's simple to [get started](https://visio.numerique.gouv.fr/) or [request a demo](mailto:visio@numerique.gouv.fr).

We’re continuously adding new features to enhance your experience, with the latest updates coming soon!

### 🚀 Major roll out to all French public servants

On the 25th of January 2026, David Amiel, France’s Minister for Civil Service and State Reform, announced the full deployment of Visio—the French government’s dedicated Meet platform—to all public servants. ([Source in French](https://www.latribune.fr/article/la-tribune-dimanche/politique/73157688099661/david-amiel-ministre-delegue-de-la-fonction-publique-nous-allons-sortir-de-la-dependance-aux-outils-americains))

## Table of Contents

- [Get started](#get-started)
- [Docs](#docs)
- [Self-host](#self-host)
- [Contributing](#contributing)
- [Philosophy](#philosophy)
- [Open source](#open-source)

## Get started

## Docs

We're currently working on both technical and user documentation for La Suite Meet. In the meantime, many of the essential aspects are already well covered by the [LiveKit documentation](https://docs.livekit.io/home/) and their [self-hosting guide](https://docs.livekit.io/home/self-hosting/deployment/). Stay tuned for more updates!

## Self-host

### La Suite Meet is easy to install on your own servers

We use Kubernetes for our [production instance](https://visio.numerique.gouv.fr/) but also support Docker Compose. The community contributed a couple other methods (Nix, YunoHost etc.) check out the [docs](/docs/installation/README.md) to get detailed instructions and examples.

**Questions?** Open an issue on [GitHub](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) or join our [Matrix community](https://matrix.to/#/#meet-official:matrix.org).

> [!NOTE]
> Some advanced features (ex: recording, transcription) lack detailed documentation. We're working hard to provide comprehensive guides soon.

#### Known instances

We hope to see many more, here is an incomplete list of public La Suite Meet instances. Feel free to make a PR to add ones that are not listed below🙏

| Url                                                           | Org          | Access                                                                                                                                        |
| ------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [visio.numerique.gouv.fr](https://visio.numerique.gouv.fr/)   | DINUM        | French public agents working for the central administration and the extended public sphere. ProConnect is required to login in or sign up     |
| [visio.suite.anct.gouv.fr](https://visio.suite.anct.gouv.fr/) | ANCT         | French public agents working for the territorial administration and the extended public sphere. ProConnect is required to login in or sign up |
| [visio.lasuite.coop](https://visio.lasuite.coop/)             | lasuite.coop | Free and open demo to all. Content and accounts are reset after one month                                                                     |
| [mosacloud.cloud](https://mosa.cloud/)                        | mosa.cloud   | Demo instance of mosa.cloud, a dutch company providing services around La Suite apps.                                                         |

## Contributing

We <3 contributions of any kind, big and small:

- Vote on features or get early access to beta functionality in our [roadmap](https://github.com/orgs/suitenumerique/projects/11/views/4)
- Open a PR (see our instructions on [developing La Suite Meet locally](https://github.com/suitenumerique/meet/blob/main/docs/developping_locally.md))
- Submit a [feature request](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=enhancement&template=Feature_request.md) or [bug report](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md)

## Philosophy

We’re relentlessly focused on building the best open-source video conferencing product—La Suite Meet. Growth comes from creating something people truly need, not just from chasing metrics.

Our users come first. We’re committed to making La Suite Meet as accessible and easy to use as proprietary solutions, ensuring it meets the highest standards.

Most of the heavy engineering is handled by the incredible LiveKit team, allowing us to focus on delivering a top-tier product. We follow extreme programming practices, favoring pair programming and quick, iterative releases. Challenge our tech and architecture—simplicity is always our top priority.

## Open-source

Gov 🇫🇷 supports open source! This project is available under [MIT license](https://github.com/suitenumerique/meet/blob/0cc2a7b7b4f4821e2c4d9d790efa739622bb6601/LICENSE).

All features we develop will always remain open-source, and we are committed to contributing back to the LiveKit community whenever feasible.
To learn more, don't hesitate to [reach out](mailto:visio@numerique.gouv.fr).

### Help us!

Come help us make La Suite Meet even better. We're growing fast and [would love some help](mailto:visio@numerique.gouv.fr).

## Contributors 🧞

<a href="https://github.com/suitenumerique/meet/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=suitenumerique/meet" />
</a>

## Credits

We're using the awesome [LiveKit](https://livekit.io/) implementation. We're also thankful to the teams behind [Django Rest Framework](https://www.django-rest-framework.org/), [Vite.js](https://vite.dev/), and [React Aria](https://github.com/adobe/react-spectrum) — Thanks for your amazing work!
This project is tested with BrowserStack.

## License

Code in this repository is published under the MIT license by DINUM (Direction interministériel du numérique).
Documentation (in the docs/) directory is released under the [Etalab-2.0 license](https://spdx.org/licenses/etalab-2.0.html).
