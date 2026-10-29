# Self-Hosting LaSuite Meet

What each piece does is in [How Meet works](../overview/how-meet-works.md#the-pieces).

!!! tip "Fastest: Quick Start"

    One script installs Meet and everything it needs on a fresh Linux server.

    [Start with Quick Start](compose/quick-start.md){ .md-button .md-button--primary }

## Other ways to install

- **[Docker Compose](compose/prerequisites.md)**, by hand: when you already run a reverse proxy or a sign-in provider.
- **[Kubernetes](kubernetes/prerequisites.md)**: for high availability. It is how DINUM runs Visio in production.
- **[Scalingo](scalingo.md)**: when your apps run there, with LiveKit hosted elsewhere.
- Community packages, not supported by the maintainers: [Nix](https://search.nixos.org/packages?channel=unstable&show=lasuite-meet&query=lasuite-meet) and [YunoHost](https://github.com/YunoHost-Apps/meet_ynh).

## Next steps

- [Set up email](configuration/email.md), so invitations and recording links reach people.
- [Harden the server](../reference/security.md#infrastructure-hardening) before it goes into production.
- [Add optional features](../user/features-controls.md#set-up-by-your-administrator).
- [Keep Meet up to date](configuration/upgrade.md).
- [Solve common problems](../reference/troubleshooting.md), or ask the [community](../index.md#community-and-support).

Images are on Docker Hub, under [lasuite](https://hub.docker.com/u/lasuite) and [livekit](https://hub.docker.com/u/livekit).
