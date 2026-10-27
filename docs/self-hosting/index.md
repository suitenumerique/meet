# Self-Hosting LaSuite Meet

LaSuite Meet is free software under the MIT license, ready to run on your own servers. Each guide below lists what it needs; what the pieces do is in [How Meet works](../overview/how-meet-works.md#the-pieces).

!!! tip "Fastest: Quick Start"

    One script does the Docker Compose install for you: the reverse proxy, Keycloak and Meet, on a fresh Linux server.

    [Start with Quick Start](compose/quick-start.md){ .md-button .md-button--primary }

## Other ways to install

- **[Docker Compose](compose/prerequisites.md)**, by hand: when you already run a reverse proxy or a sign-in provider.
- **[Kubernetes](kubernetes/prerequisites.md)**: for high availability. It is how DINUM runs Visio, and the only setup the maintainers support in production.
- **[Scalingo](scalingo.md)**: when your apps run there, with LiveKit hosted elsewhere.
- Community packages, not supported by the maintainers: [Nix](https://search.nixos.org/packages?channel=unstable&show=lasuite-meet&query=lasuite-meet) and [YunoHost](https://github.com/YunoHost-Apps/meet_ynh).

## Next steps

- [Set up email](configuration/email.md), so invitations and recording links reach people.
- [Add optional features](configuration/recording.md): recording, transcription, live subtitles, phone dial-in, all under **Configuration**.
- [Keep Meet up to date](configuration/upgrade.md).
- Stuck? See [Troubleshooting](../reference/troubleshooting.md).

Images are on Docker Hub, under [lasuite](https://hub.docker.com/u/lasuite) and [livekit](https://hub.docker.com/u/livekit). For help, see [Community and support](../index.md#community-and-support).
