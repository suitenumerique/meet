# Room purge

The `purge_inactive_rooms` command permanently deletes:

- rooms not started for [`ROOM_INACTIVITY_DELETION_DAYS`](../../reference/env-variables.md#ROOM_INACTIVITY_DELETION_DAYS) days;
- rooms their host deleted more than [`ROOM_DELETED_RETENTION_DAYS`](../../reference/env-variables.md#ROOM_DELETED_RETENTION_DAYS) days ago.

With neither set, it deletes nothing. Both are in [Environment Variables: Room purge](../../reference/env-variables.md#room-purge).

## How a room becomes purgeable

A room is inactive when LiveKit's `room_started` [webhook](livekit.md#webhook) last reported it more than [`ROOM_INACTIVITY_DELETION_DAYS`](../../reference/env-variables.md#ROOM_INACTIVITY_DELETION_DAYS) days ago, or never did and it was created more than that many days ago.

!!! warning
    If the webhook does not reach the backend, rooms in daily use look inactive and get purged.

A room its host deleted is purged at whichever of the two periods ends first. Until then:

- it is hidden, and its link says the meeting was deleted;
- it keeps its room code and PIN;
- those holding a role on its recordings can still open them.

A room holding a saved recording its users may still open outlives either period:

- with [`RECORDING_EXPIRATION_DAYS`](../../reference/env-variables.md#RECORDING_EXPIRATION_DAYS) set, a recording younger than that;
- with it unset, any saved recording, so such a room is never purged.

The backend warns at startup when a purge period is set and [`RECORDING_EXPIRATION_DAYS`](../../reference/env-variables.md#RECORDING_EXPIRATION_DAYS) is unset or not shorter than it.

## What happens to a purged room

The backend deletes the room, its accesses, its PIN code and its remaining recording entries.

!!! warning
    The recording **files stay in the bucket**: the backend never deletes one.

    Add a lifecycle rule that expires the bucket's objects after [`RECORDING_EXPIRATION_DAYS`](../../reference/env-variables.md#RECORDING_EXPIRATION_DAYS), or the purge leaves files nobody can open.

Its room code and PIN are then free for another room, and the old link opens like any unused room code, see [Unauthenticated access](sso.md#unauthenticated-access).

## Scheduling the purge

Run it once a day. Try it first with `--dry-run`, which lists what it would delete and deletes nothing:

=== "Docker Compose"

    From `~/docker/meet`:

    ```bash
    docker compose exec backend python manage.py purge_inactive_rooms --dry-run
    ```

    Then add this line to the host's crontab, with `crontab -e`:

    ```bash
    # Every day at 01:00; -T because cron runs without a terminal
    0 1 * * * cd $HOME/docker/meet && docker compose exec -T backend python manage.py purge_inactive_rooms
    ```

=== "Kubernetes"

    ```bash
    kubectl -n meet exec deployment/meet-backend -- \
      python manage.py purge_inactive_rooms --dry-run
    ```

    The chart already runs the purge daily at 01:00, from `backend.cronjobs`: nothing to add. To change its time, copy that whole list from the chart's [`values.yaml`](https://github.com/suitenumerique/meet/blob/main/src/helm/meet/values.yaml), since setting it replaces it.
