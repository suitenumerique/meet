# Upgrading

## Before upgrading

1. **Read the changelog**: Check [CHANGELOG.md](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) and [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for breaking changes between your current version and the target version.

2. **Back up your database**:
```bash
docker compose exec postgresql pg_dump -U meet meet > meet_backup_$(date +%Y%m%d).sql
```

3. **Note your current version**:
```bash
docker compose images | grep meet
```

## Standard upgrade procedure

### 1. Pull new images

```bash
docker compose pull
```

This downloads the latest images without stopping your running containers.

### 2. Check for migration requirements

Review [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for the specific version you're upgrading to. Some releases require manual steps before restarting.

### 3. Restart with new images

```bash
docker compose up -d
```

Docker Compose will recreate containers that have a new image and leave unchanged containers running.

### 4. Run database migrations

```bash
docker compose exec backend python manage.py migrate
```

Always run migrations after upgrading: they are safe to run even when the changelog mentions no schema change.

Static files ship inside the backend image, so there is no `collectstatic` step.

### 5. Verify the upgrade

```bash
# Check application logs for errors
docker compose logs --tail=50 backend
```

## Rolling back

If something goes wrong, restore the database from the backup created before upgrading:

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

Once Meet works on the restored data, drop the copy set aside above. It holds everything written since the upgrade, and the next rollback fails at the rename while it exists:

```bash
docker compose exec -T postgresql psql -U meet -d postgres \
  -c "DROP DATABASE meet_before_rollback"
```

## Version pinning

By default, `docker compose pull` fetches `:latest`. Pin `MEET_VERSION` and `LIVEKIT_VERSION` in `.env`, as the Deployment Guide's [Pin image versions](../compose/deployment-guide.md#after-installation) step shows: every Meet service reads the same variable, so they stay on one release. LiveKit Egress, if you run recording, has its own tag: pin `EGRESS_VERSION` in `.env` too, which the [Recording](recording.md) compose snippet reads. This is recommended for production to avoid unexpected upgrades.

## Keeping LiveKit up to date

LiveKit server and Egress should be upgraded separately. Check the [LiveKit changelog](https://github.com/livekit/livekit/releases) for compatibility notes with your Meet version.

```bash
docker compose pull livekit
docker compose up -d livekit
```

With recording enabled, upgrade Egress too: `docker compose pull livekit-egress && docker compose up -d livekit-egress`.

## Getting help with upgrades

Check [GitHub Issues](https://github.com/suitenumerique/meet/issues) for known upgrade problems, or ask the community, see [Community and support](../../index.md#community-and-support). A new issue needs your current version, the target version, and the error logs.
