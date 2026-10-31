# Self-Hosting LaSuite Meet

Choose how to install your own Meet instance, then check that calls work. What each piece does is in [How Meet works](../overview/how-meet-works.md#the-pieces).

!!! tip "Fastest: Quick Start"

    One script installs Meet and everything it needs on a fresh Linux server.

    [Start with Quick Start](compose/quick-start.md){ .md-button .md-button--primary }

## Other ways to install

- **[Docker Compose](compose/prerequisites.md)**, by hand: when you already run a reverse proxy or a sign-in provider.
- **[Kubernetes](kubernetes/prerequisites.md)**: for high availability. It is how DINUM runs Visio in production.
- **[Scalingo](scalingo.md)**: when your apps run there, with LiveKit hosted elsewhere.
- Community packages, not supported by the maintainers: [Nix](https://search.nixos.org/packages?channel=unstable&show=lasuite-meet&query=lasuite-meet) and [YunoHost](https://github.com/YunoHost-Apps/meet_ynh).

## Install with an AI assistant

Copy this request into your assistant as it is: it asks for your domain, your install method and the features you want before it starts.

```text
Install LaSuite Meet for me, following its documentation:
https://documentation-meet.beta.numerique.gouv.fr/self-hosting/

Before you start, ask me:
- the domain to use
- how to install it: Docker Compose, Kubernetes or Scalingo
- which optional features to turn on: recording, AI transcription,
  live subtitles, telephony

Every feature and setting is listed at
https://documentation-meet.beta.numerique.gouv.fr/self-hosting/customising/

When you are done, prove that it works and show me the whole output.
On Docker Compose, run:
cd ~/docker/meet && curl -fsSL https://raw.githubusercontent.com/suitenumerique/meet/main/docs/check-install.sh | bash
On Kubernetes, run the Helm guide's "Check the install" steps.
```

The check at the end is your proof, whatever the assistant reports.

## Check your install { #check-that-it-works }

Whichever way you installed Meet, by hand or with an AI assistant, check the result yourself: a page that loads does not prove that calls work. [Check your install](verify.md) runs every check, from the services to a call between two networks, with what passing looks like for each.

## Next steps

Before production, work through the Deployment Guide's [After installation](compose/deployment-guide.md#after-installation) steps; its Docker commands apply to Compose alone. On Kubernetes, set up email as [Kubernetes setup](configuration/email.md#kubernetes-setup) shows, pin the chart as [Install](kubernetes/helm.md#install) shows and back up the database as [Upgrading](kubernetes/helm.md#upgrading) shows. On Scalingo, [Upgrade](scalingo.md#upgrade) covers backups.

Once Meet runs, [Customising Meet](customising.md) lists everything you can change, from its look to who can join and what gets recorded, with a link to each guide.

Images are on Docker Hub, under [lasuite](https://hub.docker.com/u/lasuite) and [livekit](https://hub.docker.com/u/livekit).
