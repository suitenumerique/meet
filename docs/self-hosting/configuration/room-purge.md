# Room purge

The `purge_inactive_rooms` command permanently deletes rooms not started for `ROOM_INACTIVITY_DELETION_DAYS` days, and rooms their owner deleted more than `ROOM_DELETED_RETENTION_DAYS` days ago. With neither set, it deletes nothing. Both are in [Environment Variables: Room purge](../../reference/env-variables.md#room-purge).

## How a room becomes purgeable

The backend records the date each time LiveKit's `room_started` webhook says a room has started. A room is inactive when it was last started more than `ROOM_INACTIVITY_DELETION_DAYS` days ago, or was never started and was created more than that many days ago.

!!! warning
    Inactivity is measured from that webhook alone. If LiveKit's webhook does not reach the backend, rooms in daily use look inactive and get purged. The [Deployment Guide](../compose/deployment-guide.md#stack-3-meet-core) sets the webhook URL in `livekit-server.yaml`.

The upgrade to v1.33.0 marked every existing room as started that day, so none is purged before a full inactivity period has passed since.

Deleting a room only soft-deletes it:

- The room is hidden, and its link tells visitors the meeting was deleted.
- It keeps its room code and PIN code, so no other room can take them.
- Its recordings stay available to the people holding a role on them.
- It is never started again, so it is purged at whichever of the two periods ends first.

## Rooms that are kept

A recording is reached only through its room, so a room outlives either period while it holds a saved recording its users may still open:

- with `RECORDING_EXPIRATION_DAYS` set, a saved recording created less than that many days ago,
- with `RECORDING_EXPIRATION_DAYS` unset, any saved recording, so such a room is never purged.

The backend warns at startup when a purge period is set and `RECORDING_EXPIRATION_DAYS` is unset, or is not shorter than the purge period.

## What happens to a purged room

The backend deletes the room from the database, with its accesses, its telephony PIN code, and the recording entries it still holds, which are the expired ones and the ones never saved.

The recording **files stay in the bucket**: the backend never deletes one. Add a lifecycle rule that expires the bucket's objects after `RECORDING_EXPIRATION_DAYS`, or the purge leaves files that take up storage and nobody can open, since serving a recording needs its database entry.

Once a room is purged, its room code is free again. A soft-deleted room's link then no longer says the meeting was deleted, and its PIN code can go to another room. What opening the old link does depends on `ALLOW_UNREGISTERED_ROOMS`:

| `ALLOW_UNREGISTERED_ROOMS` | Opening the old link |
|---|---|
| `False` | Only a signed-in user can open it. Doing so creates the room again, with a fresh configuration and that user as its owner. |
| `True` | Anyone can open it. The meeting runs without any room stored in the database. |

## Scheduling the purge

Run the command once a day. Try it first with `--dry-run`, which lists the rooms it would delete, marking the soft-deleted ones, and deletes nothing:

=== "Docker Compose"

    From `~/docker/meet`, list what would go:

    ```bash
    docker compose exec backend python manage.py purge_inactive_rooms --dry-run
    ```

    Compose has no scheduler: add this line to the host's crontab with `crontab -e`:

    ```bash
    # Every day at 01:00; -T because cron runs without a terminal
    0 1 * * * cd $HOME/docker/meet && docker compose exec -T backend python manage.py purge_inactive_rooms
    ```

=== "Kubernetes"

    List what would go:

    ```bash
    kubectl -n meet exec deployment/meet-backend -- python manage.py purge_inactive_rooms --dry-run
    ```

    The chart already runs the purge every day at 01:00, from `backend.cronjobs`. Setting that list in your `values.yaml` replaces it whole: keep this entry, and copy the chart's `clean-pending-files` and `purge-deleted-files` from its [`values.yaml`](https://github.com/suitenumerique/meet/blob/main/src/helm/meet/values.yaml) too:

    ```yaml
    backend:
      cronjobs:
        - name: purge-inactive-rooms
          schedule: "0 1 * * *"
          command:
            - "/bin/sh"
            - "-c"
            - "python manage.py purge_inactive_rooms"
    ```
