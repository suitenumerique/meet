# Quick Start

One script installs Meet on a fresh Linux server, with HTTPS and sign-in ready.

Recording and transcription are left out.

Before you run it, read the [Prerequisites](prerequisites.md). The script brings Keycloak, so you need no sign-in provider of your own.

## Download and run

Download the script:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL $RAW/docs/install.sh -o install.sh
```

Review it, then run it and answer its prompts with your three domains and two email addresses:

```console
$ bash install.sh
...
▶ Domains
  Meet domain       (e.g. meet.example.com):    meet.example.com
  Keycloak domain   (e.g. auth.example.com):    auth.example.com
  LiveKit domain    (e.g. livekit.example.com): livekit.example.com
  Email for Let's Encrypt notifications:        you@example.com
  Admin user email  (e.g. you@example.com):     you@example.com
...
╔══════════════════════════════════════════════════════════════╗
║  Setup complete!                                             ║
╚══════════════════════════════════════════════════════════════╝
...
  Meet login:      meet-admin / <password>
...
  Meet admin panel: https://meet.example.com/admin/  you@example.com / <password>
...
```

It only sets up a fresh install: it stops if `~/docker/keycloak` or `~/docker/meet` exists, since new passwords would not match the existing databases.

!!! warning
    To start over, remove both stacks and their data as [Stop or remove](deployment-guide.md#stop-or-remove) shows, then delete both directories.

## After setup

Note the two printed passwords: they are saved nowhere else. The URLs use your own domains, with no port.

| Login | What for | URL | User | Password |
|---|---|---|---|---|
| Meet | Sign in to Meet and start meetings | `https://meet.example.com` | `meet-admin` | Printed, single-use: Keycloak asks for a new one |
| Django admin | Manage rooms, users and recordings | `https://meet.example.com/admin/` | The admin email you entered | Printed |
| Keycloak console | Add or manage the people who can sign in | `https://auth.example.com/admin/` | `admin` | `KC_BOOTSTRAP_ADMIN_PASSWORD` in `~/docker/keycloak/env.d/keycloak` |

## Check the install

```bash
cd ~/docker/meet && curl -fsSL https://raw.githubusercontent.com/suitenumerique/meet/main/docs/check-install.sh | bash
```

The command prints ✓ or ✗ for each check, then a verdict; [Check your install](../verify.md) explains a failing line and the call to make next.

## Next

- To see what the script set up, read [`install.sh`](https://github.com/suitenumerique/meet/blob/main/docs/install.sh) itself: one labelled section per stack.
- Before production, work through the Deployment Guide's [After installation](deployment-guide.md#after-installation) steps.
