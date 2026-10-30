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

## Check that it works

Whichever way you installed Meet, by hand or with an AI assistant, check the result yourself: a page that loads does not prove that calls work.

1. **Every service runs.** With Docker Compose, `docker compose ps` in each stack's directory shows every container `Up`, and `backend` and `postgresql` `(healthy)`. On Kubernetes, `kubectl -n meet get pods` shows every pod `Running`.
2. **The three addresses answer.** Run the `curl` commands of the Deployment Guide's [Verify](compose/deployment-guide.md#verify) step against your domains.
3. **Sign-in works.** Open your Meet address and click **Login**: you reach your identity provider and come back signed in.
4. **A real call works.** Join the same room from two devices, one of them on another network such as a phone on mobile data. Audio and video both ways prove that LiveKit's [ports](configuration/firewall.md) are open; if media is missing, see [Troubleshooting](../reference/troubleshooting.md).
5. **Each feature you turned on works.** For recording, record a minute, stop, and check that the email arrives and its link plays the file.

## Next steps

Before production, work through the Deployment Guide's [After installation](compose/deployment-guide.md#after-installation) steps; its Docker commands apply to Compose alone. On Kubernetes, set up email as [Kubernetes setup](configuration/email.md#kubernetes-setup) shows, pin the chart as [Install](kubernetes/helm.md#install) shows and back up the database as [Upgrading](kubernetes/helm.md#upgrading) shows. On Scalingo, [Upgrade](scalingo.md#upgrade) covers backups.

Once Meet runs, [Customising Meet](customising.md) lists everything you can change, from its look to who can join and what gets recorded, with a link to each guide.

Images are on Docker Hub, under [lasuite](https://hub.docker.com/u/lasuite) and [livekit](https://hub.docker.com/u/livekit).
