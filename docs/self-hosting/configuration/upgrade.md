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

Always run migrations after upgrading - even if the changelog doesn't mention schema changes, it is safe to run.

### 5. Collect static files

```bash
docker compose exec backend python manage.py collectstatic --no-input
```

### 6. Verify the upgrade

```bash
# Check application logs for errors
docker compose logs --tail=50 backend
```

## Rolling back

If something goes wrong, restore the database from the backup created before upgrading:

```bash
# Stop the backend and workers
docker compose stop backend celery

# Restore the database
docker compose exec -T postgresql psql -U meet meet < meet_backup_YYYYMMDD.sql

# Pin image tags to the previous version in compose.yml, then:
docker compose pull
docker compose up -d
```

## Version pinning

By default, `docker compose pull` fetches `:latest`. To pin to a specific version, edit your `compose.yml`:

```yaml
services:
  backend:
    image: lasuite/meet-backend:1.15.0  # pin to specific version
```

This is recommended for production to avoid unexpected upgrades.

## Keeping LiveKit up to date

LiveKit server and Egress should be upgraded separately. Check the [LiveKit changelog](https://github.com/livekit/livekit/releases) for compatibility notes with your Meet version.

```bash
docker compose pull livekit livekit-egress
docker compose up -d livekit livekit-egress
```

## Getting help with upgrades

If you encounter issues during an upgrade:

- Check [GitHub Issues](https://github.com/suitenumerique/meet/issues) for known upgrade problems
- Ask in the [Matrix community](https://matrix.to/#/#meet-official:matrix.org)
- Open a new issue with your current version, target version, and error logs
