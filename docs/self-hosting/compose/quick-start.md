# Quick Start

One script installs Meet on a fresh Linux server, with HTTPS and sign-in ready.

Recording and transcription are left out. Already have a reverse proxy or a sign-in provider? Use the [Deployment Guide](deployment-guide.md) instead.

Before you run it, tick the [Prerequisites checklist](prerequisites.md#checklist). The script brings Keycloak, so skip the OIDC provider line.

---

## Download and run

Download the script:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL $RAW/docs/install.sh -o install.sh
```

Review it, then run:

```bash
bash install.sh
```

The script asks for your three domains and two email addresses, then ends with `Setup complete!`.

It only sets up a fresh install: it stops if `~/docker/keycloak` or `~/docker/meet` exists, since new passwords would not match the existing databases. To start over, run `docker compose down -v` in each, which deletes their data, then delete both directories.

---

## After setup

Note the two printed passwords: they are saved nowhere else. The URLs use your own domains, with no port.

| Login | What for | URL | User | Password |
|---|---|---|---|---|
| Meet | Sign in to Meet and start meetings | `https://meet.example.com` | `meet-admin` | Printed, single-use: Keycloak asks for a new one |
| Django admin | Manage rooms, users and recordings | `https://meet.example.com/admin/` | The admin email you entered | Printed |
| Keycloak console | Add or manage the people who can sign in | `https://auth.example.com/admin/` | `admin` | `KC_BOOTSTRAP_ADMIN_PASSWORD` in `~/docker/keycloak/env.d/keycloak` |

## Next

To understand or change a piece the script set up, read the [Deployment Guide](deployment-guide.md): same stacks, same files. Before production, work through its [After installation](deployment-guide.md#after-installation) steps. To change the look, see [Theming](../configuration/theming.md).
