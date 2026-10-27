# Upgrading

These steps are for Docker Compose. On Kubernetes, migrations run as a Job, see [Helm: Upgrading](../kubernetes/helm.md#upgrading).

## Before upgrading

1. **Read what changed.** [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) lists every release, and [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) the manual steps some releases need. Read both for every version between yours and the target: releases are applied in order, and only patch releases can be skipped.
2. **Back up the database**, from `~/docker/meet`:

    ```bash
    docker compose exec -T postgresql pg_dump -U meet meet > meet_backup_$(date +%Y%m%d).sql
    ```

    `-T` disables the pseudo-terminal, so nothing but the dump reaches the file.

3. **Note the version you run now**, to roll back to: `docker compose images backend` shows its tag.

## Upgrade

1. Set `MEET_VERSION` in `.env` to the target release, for example `MEET_VERSION=v1.36.3`. Every Meet service reads this one variable, so they all move together. With no `MEET_VERSION` set, Compose uses `latest`.
2. Download the images, without stopping anything yet:

    ```bash
    docker compose pull
    ```

3. Apply any manual step UPGRADE.md lists for the target version.
4. Start the new images:

    ```bash
    docker compose up -d
    ```

5. Run the database migrations. They are safe to run even when the release changes no schema, so always run them:

    ```bash
    docker compose exec backend python manage.py migrate
    ```

6. Check the backend started cleanly: `docker compose logs --tail=50 backend`.

## Rolling back

Restore the database from the backup taken before upgrading, then go back to the old version:

```bash
# Stop the backend and workers
docker compose stop backend celery

# Move the migrated database aside, then restore into an empty one: a restore
# over the migrated schema keeps the new tables and columns
docker compose exec -T postgresql psql -U meet -d postgres \
  -c "ALTER DATABASE meet RENAME TO meet_before_rollback"
docker compose exec -T postgresql createdb -U meet meet
docker compose exec -T postgresql psql -U meet -v ON_ERROR_STOP=1 meet < meet_backup_YYYYMMDD.sql

# Set MEET_VERSION in .env back to the previous version, then:
docker compose pull
docker compose up -d
```

Once Meet works on the restored data, drop `meet_before_rollback`. It holds everything written since the upgrade, and while it exists the next rollback fails at the rename:

```bash
docker compose exec -T postgresql psql -U meet -d postgres \
  -c "DROP DATABASE meet_before_rollback"
```

## LiveKit and Egress

LiveKit is versioned independently of Meet: check the [LiveKit releases](https://github.com/livekit/livekit/releases) before moving it. In `.env`, set the new tag in `LIVEKIT_VERSION`, and in `EGRESS_VERSION` if you run recording. Then:

```bash
docker compose pull livekit livekit-egress
docker compose up -d livekit livekit-egress
```

Leave out `livekit-egress` if you do not run recording. A restart of LiveKit drops the calls in progress, so pick a quiet hour.

## Getting help

Look for known upgrade problems in [GitHub Issues](https://github.com/suitenumerique/meet/issues), or ask the community, see [Community and support](../../index.md#community-and-support). A new issue needs your current version, the target version and the error logs.
