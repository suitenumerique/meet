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

### Local development: MinIO replaced by Garage

The development stacks now use [Garage](https://garagehq.deuxfleurs.fr/) instead of MinIO as S3 storage . Garage keeps its own format in `data/media/meta` and `data/media/data` and cannot read what MinIO left there, so local recordings and files will be lost.

To migrate a local environment:

1. Stop the stack and remove its containers, including the former `minio` one: `docker compose down --remove-orphans`
2. Optionally reclaim the space used by MinIO: `rm -rf data/media && make data/media`
3. In your `env.d/development/*` files, replace `minio:9000` by `garage:9000`, the `meet` / `password` credentials by `meet-access-key` / `meet-secret-access-key`, and add `AWS_S3_REGION_NAME=local` (or delete these files and run `make create-env-files`)
4. Run `make create-env-files` to generate `env.d/development/garage`, which holds a random RPC secret for Garage.
5. Rebuild the images, since the summary and agent images now install boto3 instead of minio

### Summary service and metadata collector: boto3 replaces the minio client

The summary service and the metadata collector agent now talk to S3 through boto3 instead of the minio client, with the same settings.
Requests are signed for `AWS_S3_REGION_NAME`. When it is not set, the region is still looked up from the bucket, but the fallbacks changed:

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
