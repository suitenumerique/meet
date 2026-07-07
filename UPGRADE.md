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
are unchanged and keep their values.

#### If you never set `RECORDING_ENCODING_ENABLED=True`

No action is required. The shipped defaults (`RECORDING_ENCODING_DEFAULT_PROFILE=full`,
`RECORDING_ENCODING_DEFAULT_RESOLUTION=720p`) match LiveKit's built-in
`H264_720P_30` preset: 1280×720, 30 fps, 3000 kbps H.264 MAIN, 128 kbps AAC.

Note that these values are now sent explicitly as advanced `EncodingOptions`
rather than relying on LiveKit's preset, so `RECORDING_ENCODING_AUDIO_BITRATE_KBPS`
and `RECORDING_ENCODING_KEY_FRAME_INTERVAL_S` now apply to every recording. They
previously applied only when `RECORDING_ENCODING_ENABLED` was `True`.

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

Two constraints are validated at startup and may raise a `ValueError`:

- every profile in `RECORDING_ENCODING_AVAILABLE_PROFILES` must define a `kbps`
  entry for **exactly** the keys of `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`;
  overriding one of the two maps usually means overriding both;
- `RECORDING_ENCODING_DEFAULT_RESOLUTION` and `RECORDING_ENCODING_DEFAULT_PROFILE`,
  when non-empty, must be keys of their respective map.

#### Optional: per-recording encoding

`RECORDING_CUSTOM_ENCODING_ENABLED` (default `False`) toggles whether the
start-recording API accepts an `encoding` object
(`{"resolution": "720p", "profile": "talking_heads"}`, `profile` optional) that
overrides the default for a single recording. It does not enable or disable the
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
