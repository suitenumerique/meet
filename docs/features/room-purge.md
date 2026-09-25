# Room purge

Rooms pile up over time and most of them are only used once. The `purge_inactive_rooms` management command permanently deletes the rooms that have not been started for a configurable number of days. It is disabled by default.

## How it works

Each time LiveKit tells the backend that a room has started (`room_started` webhook), the backend records the date on the room (`last_started_at`).
A room is inactive when:

- it was last started more than `ROOM_INACTIVITY_DELETION_DAYS` days ago, or
- it was never started and was created more than `ROOM_INACTIVITY_DELETION_DAYS` days ago.

Rooms that existed before this feature was deployed are considered started on the day of the release, so none of them can be purged before a full inactivity period has elapsed.

The command is meant to run once a day. The Helm chart schedules it in `backend.cronjobs` (`purge-inactive-rooms`, 01:00); it does nothing until `ROOM_INACTIVITY_DELETION_DAYS` is set.

```bash
python manage.py purge_inactive_rooms            # delete the inactive rooms
python manage.py purge_inactive_rooms --dry-run  # only list the rooms that would be deleted
```

## Rooms that are kept

A recording can only be reached through its room. An inactive room is kept as long as it holds a recording its users may still access:

- with `RECORDING_EXPIRATION_DAYS` set, a recording created less than that many days ago,
- with `RECORDING_EXPIRATION_DAYS` unset, any recording.

## What happens to a purged room

The room is deleted from the database, along with its accesses, its telephony PIN code, and the recording entries it still holds — the expired or unsuccessful ones, since any other recording would have protected the room — together with their own accesses.

The recording **files in the bucket are left untouched**: the backend never deletes anything from the storage, it only drops the database entries pointing at it. Removing the files is the job of the bucket lifecycle policy, which should match `RECORDING_EXPIRATION_DAYS` (see the [recording documentation](recording.md)). When the two do not match, the purge leaves objects behind: they become unreachable, since serving a recording requires its database entry, but they keep costing storage.

⚠️ When a room is purged, all it's configuration and access rights are also deleted. Its slug becomes available again
and can be reused when a meeting is created from that same URL.

* With `ALLOW_UNREGISTERED_ROOMS=false`, only an authenticated user can navigate to a previously existing link after the room has been purged. Doing so recreates the room in the database with a fresh configuration, with that user associated with it and granted admin rights.

* With `ALLOW_UNREGISTERED_ROOMS=true`, any user can reopen the purged room by navigating to the same URL. In that case, the room is created dynamically and no corresponding room entry is persisted in the database.
