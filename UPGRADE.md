# Upgrade

All instructions to upgrade this project from one release to the next will be
documented in this file. Upgrades must be run sequentially, meaning you should
not skip minor/major releases while upgrading (fix releases can be skipped).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For most upgrades, you just need to run the django migrations with
the following command inside your docker container:

`python manage.py migrate`

(Note : in your development environment, you can `make migrate`.)

## [Unreleased]

### Marketing / Brevo integration now uses `django-lasuite`

The in-house marketing service (`core.services.marketing`) has been removed and
replaced by the shared implementation from `django-lasuite`
(`lasuite.marketing`). This fixes a bug where updating a user's contact on
Brevo overwrote their list memberships, removing lists set by other
La Suite products. Existing lists are now preserved and merged.

**Celery worker required.** Newsletter signup on login
(`SIGNUP_NEW_USER_TO_MARKETING_EMAIL=True`) is now dispatched as an
asynchronous Celery task (`lasuite.marketing.tasks.create_or_update_contact`)
instead of a synchronous call with a 1s timeout. Make sure a Celery worker is
running alongside the backend, otherwise contacts will never be pushed to Brevo.

**Configuration changes.** The following environment variables / settings are
**removed** and no longer read:

- `MARKETING_SERVICE_CLASS`
- `BREVO_API_KEY`
- `BREVO_API_CONTACT_LIST_IDS`
- `BREVO_API_CONTACT_ATTRIBUTES` (previous default: `{"VISIO_USER": True}`)
- `BREVO_API_TIMEOUT`

They are replaced by a single `LASUITE_MARKETING` setting, configured through:

| Variable                       | Default                                          | Description                                  |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| `LASUITE_MARKETING_BACKEND`    | `lasuite.marketing.backends.dummy.DummyBackend`  | Backend class path                           |
| `LASUITE_MARKETING_PARAMETERS` | `{}`                                             | Keyword arguments passed to the backend      |

⚠️ The default backend is now a **dummy** (no-op). If you previously used
Brevo, you must explicitly configure it, otherwise signups are silently dropped:

    LASUITE_MARKETING_BACKEND=lasuite.marketing.backends.brevo.BrevoBackend
    LASUITE_MARKETING_PARAMETERS={"api_key": "<your-brevo-api-key>", "api_contact_list_ids": [1, 2], "api_contact_attributes": {"VISIO_USER": True}}

Migration mapping:

- `BREVO_API_KEY` → `api_key`
- `BREVO_API_CONTACT_LIST_IDS` → `api_contact_list_ids`
- `BREVO_API_CONTACT_ATTRIBUTES` → `api_contact_attributes` (re-add
  `{"VISIO_USER": True}` if you relied on the old default)
- `BREVO_API_TIMEOUT` → no equivalent (the request runs in a background task)

Note: `BREVO_API_KEY` used to support being read from a secret file; the API key
now lives inside `LASUITE_MARKETING_PARAMETERS`, so adapt how you inject that
secret (e.g. build the whole variable from your secret store).

### Recording encoding settings replaced by a resolution/profile model

The `RECORDING_ENCODING_*` settings introduced in v1.16.0 exposed raw encoder
values (width, height, framerate, bitrate). They are replaced by two named and configurable sets of
dimensions, a **resolution** (default: `540p`, `720p`, `1080p`) and a **profile**
(default: `talking_heads`, `text`, `mixed`, `full`), which are resolved to the width, height,
fps and video bitrate.

**The following environment variables are no longer read. If they are still set in
your deployment they are silently ignored, and your recordings will be encoded with
the new defaults instead of your tuned values.**

| Removed variable                        | Replaced by                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `RECORDING_ENCODING_ENABLED`            | Nothing. A default encoding is now always built (see below). **Not** `RECORDING_CUSTOM_ENCODING_ENABLED`, which gates a different feature. |
| `RECORDING_ENCODING_WIDTH`              | The `width` of the entry selected by `RECORDING_ENCODING_DEFAULT_RESOLUTION` in `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`. |
| `RECORDING_ENCODING_HEIGHT`             | The `height` of that same entry.                                                                              |
| `RECORDING_ENCODING_FRAMERATE`          | The `fps` of the profile selected by `RECORDING_ENCODING_DEFAULT_PROFILE` in `RECORDING_ENCODING_AVAILABLE_PROFILES`. |
| `RECORDING_ENCODING_VIDEO_BITRATE_KBPS` | That profile's `kbps`.                                                                  |

`RECORDING_ENCODING_AUDIO_BITRATE_KBPS` and `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S`
keep their names and meaning. The keyframe interval now defaults to `0` (unset,
encoder's choice) instead of `4.0`.

#### If you never set `RECORDING_ENCODING_ENABLED=True`

The shipped defaults (`RECORDING_ENCODING_DEFAULT_PROFILE=full`,
`RECORDING_ENCODING_DEFAULT_RESOLUTION=720p`) match LiveKit's built-in
`H264_720P_30` preset: 1280×720, 30 fps, 3000 kbps H.264 MAIN, 128 kbps AAC.
Video output is therefore unchanged.

Audio and keyframing may not be. These values are now sent explicitly as advanced
`EncodingOptions` rather than relying on LiveKit's preset, so
`RECORDING_ENCODING_AUDIO_BITRATE_KBPS` and `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S`
now apply to every recording. They previously applied only when
`RECORDING_ENCODING_ENABLED` was `True`. **If you set either of them while the
feature was disabled, they had no effect and now do**; check them before upgrading.

If you never set them, no action is required: 128 kbps AAC is what the preset used,
and the keyframe interval now defaults to `0`, which leaves the field unset so the
encoder keeps picking it as before. Set `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S=4.0`
if you want fixed 4-second keyframes (the value the setting defaulted to while it
was gated behind `RECORDING_ENCODING_ENABLED`).

To keep letting LiveKit pick the encoding instead, set either default to an empty
value:

```
RECORDING_ENCODING_DEFAULT_RESOLUTION=
RECORDING_ENCODING_DEFAULT_PROFILE=
```

#### If you had tuned `RECORDING_ENCODING_*` values

Translate your old values into a default resolution and a default profile. Declare your own resolution and/or profile. Both maps are read from the
environment as a single-line Python/JSON dict literal (parsed with
`ast.literal_eval`, so use double-quoted keys and no trailing commas, and do not
add outer quotes in `.env`-style files):

```bash
RECORDING_ENCODING_AVAILABLE_RESOLUTIONS={"540p": {"width": 960, "height": 540}, "720p": {"width": 1280, "height": 720}, "1080p": {"width": 1920, "height": 1080}}
RECORDING_ENCODING_AVAILABLE_PROFILES={"my_old_profile": {"fps": 15, "kbps": {"540p": 350, "720p": 600, "1080p": 1100}}}
RECORDING_ENCODING_DEFAULT_RESOLUTION=720p
RECORDING_ENCODING_DEFAULT_PROFILE=my_old_profile
```

Both maps are validated at startup and a malformed one raises a `ValueError`:

- every entry of `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS` must declare `width` and
  `height`, and every entry of `RECORDING_ENCODING_AVAILABLE_PROFILES` an `fps` and a
  `kbps` map;
- every profile must define a `kbps` entry for **exactly** the keys of
  `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`; overriding one of the two maps usually
  means overriding both;
- `RECORDING_ENCODING_DEFAULT_RESOLUTION` and `RECORDING_ENCODING_DEFAULT_PROFILE`,
  when non-empty, must be keys of their respective map.

#### Breaking: custom worker services must accept `encoding_options`

Only concerns deployments pointing `RECORDING_WORKER_CLASSES` at their own worker
class. The shipped `VideoCompositeEgressService` and `AudioCompositeEgressService`
are already updated.

The `WorkerService` protocol's `start()` takes a third argument, and the mediator
now always passes it as a keyword when the recording carries no per-recording encoding:

```python
# before
def start(self, room_id: str, recording_id: str) -> str: ...

# now
def start(
    self,
    room_id: str,
    recording_id: str,
    encoding_options: Optional[Dict[str, Any]] = None,
) -> str: ...
```

#### Optional: per-recording encoding

`RECORDING_CUSTOM_ENCODING_ENABLED` (default `False`) toggles whether the
start-recording API accepts an `encoding` object
(`{"resolution": "720p", "profile": "talking_heads"}`, `profile` optional. It
falls back to `RECORDING_ENCODING_DEFAULT_PROFILE`) that overrides the default for
a single recording. It does not enable or disable the
default encoding, which is built from the two `RECORDING_ENCODING_DEFAULT_*`
settings either way. Leaving it at `False` preserves the previous behaviour, where
every recording uses the server-side encoding: requests carrying
`options.encoding` are rejected with a `400` before the recording is created, so
nothing is persisted and no egress is started.

Before enabling it:

- clients can only pick keys you declared; there is no way to send a raw width or bitrate
- as of this implementation, the frontend never sends `encoding` 
- `encoding` is accepted but ignored for `transcript` recordings, whose audio-only
  egress has no video encoding to configure.

See [docs/features/recording.md](docs/features/recording.md#tuning-recording-encoding)
for the full setting reference, the shipped profile table and the tuning caveats.

## v1.33.0

### Purging inactive rooms

Rooms now keep track of the last time they were started (`last_started_at`), fed by LiveKit's `room_started` webhook. A new `purge_inactive_rooms` management command permanently deletes the rooms that have not been started for `ROOM_INACTIVITY_DELETION_DAYS` days. See [the room purge documentation](docs/features/room-purge.md).

- The feature is **disabled by default**: nothing is deleted unless you set `ROOM_INACTIVITY_DELETION_DAYS`.
- The migration marks every existing room as started at the time of the upgrade, so no existing room can be purged before a full inactivity period has elapsed after upgrading.
- Rooms holding a saved recording their users may still access are kept: any saved recording, or, when `RECORDING_EXPIRATION_DAYS` is set, a saved recording created within that window.
- Inactivity is measured from LiveKit's `room_started` webhook: if it is not delivered to your backend, rooms in daily use look inactive and get purged.
- When a room is purged, all it's configuration and access rights are also deleted. Its slug becomes available again and can be reused when a meeting is created from that same URL.

* With `ALLOW_UNREGISTERED_ROOMS=false`, only an authenticated user can navigate to a previously existing link after the room has been purged. Doing so recreates the room in the database with a fresh configuration, with that user associated with it and granted admin rights.
* With `ALLOW_UNREGISTERED_ROOMS=true`, any user can reopen the purged room by navigating to the same URL. In that case, the room is created dynamically and no corresponding room entry is persisted in the database.

### Local development: MinIO replaced by Garage

The development stacks now use [Garage](https://garagehq.deuxfleurs.fr/) instead of MinIO as S3 storage. Garage keeps its own format in `data/media/meta` and `data/media/data` and cannot read what MinIO left there, so local recordings and files will be lost.

To migrate a local environment:

1. Stop the stack and remove its containers, including the former `minio` one: `docker compose down --remove-orphans`
2. Optionally reclaim the space used by MinIO: `rm -rf data/media && make data/media`
3. In your `env.d/development/*` files, replace `minio:9000` by `garage:9000`, the `meet` / `password` credentials by `meet-access-key` / `meet-secret-access-key`, and add `AWS_S3_REGION_NAME=local` (or delete these files and run `make create-env-files`)
4. Run `make create-env-files` to generate `env.d/development/garage`, which holds a random RPC secret for Garage.
5. Rebuild the images, since the summary and agent images now install boto3 instead of minio

### Summary service and metadata collector: boto3 replaces the minio client

The summary service and the metadata collector agent now talk to S3 through boto3 instead of the minio client, with the same settings.
Requests are now signed for `AWS_S3_REGION_NAME` as-is. When it is not set, the region is no longer looked up from the bucket: boto3 falls back to `AWS_DEFAULT_REGION`. If you left `AWS_S3_REGION_NAME` unset, set it to your provider's region before upgrading, or providers that check the signing region will reject the transcripts, summaries and meeting metadata uploads, as well as their signed URLs.

Also:
- Signed URLs to transcripts and summaries are now always path-style (`<endpoint>/<bucket>/<key>`), whereas the minio client used virtual-hosted-style URLs
- The metadata collector now accepts `AWS_S3_ENDPOINT_URL` with or without a scheme, like the summary service: the scheme always follows `AWS_S3_SECURE_ACCESS`.

### Helm chart: media services default to Garage

The `meet` chart now defaults `serviceMedia.host` and `serviceMediaFiles.host` to `garage.meet.svc.cluster.local`, and the `upstream-vhost` annotation of `ingressMedia` and `ingressMediaFiles` to `garage.meet.svc.cluster.local:9000`. If you relied on the former `minio.meet.svc.cluster.local` defaults, set these values explicitly to your S3 service before upgrading, or recordings and files stop being served under `/media`.

## v1.30.0

### Removing S3 storage-event webhooks for recordings

Recordings were previously confirmed as saved by an S3 storage-event webhook posting to `/api/v1.0/recordings/storage-hook/`. That endpoint has been removed: recordings are now always finalized from LiveKit's own `egress_ended` webhook, which has been the default path since v1.22.0.

**Required for every deployment:** LiveKit must be able to deliver webhooks to the backend at `/api/v1.0/rooms/webhooks-livekit/`. This is now the only way a recording reaches a saved state; if `egress_ended` is never delivered, recordings stay in the `active` state.

For hosters who had configured storage-event webhooks:
- Recordings reach the same final state, but they are now finalized when LiveKit reports the egress as ended rather than when the storage backend reports the upload.
- Remove the event notification from your bucket configuration: it now targets a non-existent endpoint and will fail on every delivery.

For hosters who had **not** configured storage-event webhooks:
- Nothing changes. Recordings have been finalized from the `egress_ended` webhook since v1.22.0.

In both cases, the following settings are no longer used and can be removed from your env: `RECORDING_EVENT_PARSER_CLASS`, `RECORDING_ENABLE_STORAGE_EVENT_AUTH`, `RECORDING_STORAGE_EVENT_ENABLE`, `RECORDING_STORAGE_EVENT_TOKEN`.

On completion of the egress, a recording moves to `notification_succeeded`, or to `saved` if notifying external services failed.

## v1.23.0

As part of the 1.23.0 release, the legacy `api/v1` implementation has been removed from the _experimental_ Summary service and Meet has been migrated to the new `api/v2`.

**To avoid a breaking change, the Meet backend continues to use the Summary service's v1-compatible API format by default (`SUMMARY_SERVICE_VERSION` setting defaults to `1`).**

If you are deploying both Meet and Summary from this repository, you must configure the Meet backend to use the v2 API by setting the following environment variable `SUMMARY_SERVICE_VERSION=2`.

If you are upgrading only the Meet deployment while keeping an older Summary v1 compatible deployment, no action is required, as the v1-compatible API remains the default.

Note that we plan on removing the legacy `v1` summary compatibility in a future major version. If you have your own implementation for the summary service, we recommend updating its API contract and setting `SUMMARY_SERVICE_VERSION=2`.
