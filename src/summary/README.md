# Experimental Stack

This is an experimental part of the stack.  It currently lacks proper observability, unit tests, and other production-grade features. This serves as the base for AI features in Visio.

## How it works 

Please refer to the [Recording feature documentation](https://github.com/suitenumerique/meet/blob/main/docs/features/recording.md) and the [Transcription feature documentation](https://github.com/suitenumerique/meet/blob/main/docs/features/transcription.md).

## How to develop

(To develop locally follow the instructions on [developing La Suite Meet locally](https://github.com/suitenumerique/meet/blob/main/docs/developping_locally.md))

From the root of the project:

```sh
make bootstrap
```

Configure your env values in `env.d/summary` to properly set up WhisperX and the LLM API you will call.

```sh
make run
```

When the stack is up, configure the MinIO webhook
*(TODO: add this step to `make bootstrap`)*

```sh
make minio-webhook-setup
```

If you want to develop on the Celery workers with hot reloading, run:

```sh
docker compose watch celery-summary-transcribe celery-summary-summarize
```

Celery workers will hot reload on any change.
