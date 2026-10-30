# AI Transcription

AI transcription, in beta, turns a meeting's speech into a [LaSuite Docs](https://github.com/suitenumerique/docs) document owned by the person who started it, through the summary service: see [How do transcription and the summary work?](../../overview/how-meet-works.md#transcription-and-summary).

The people who [can record](recording.md#who-can-record) can start one, alone or with a screen recording. With [`FRONTEND_ANALYTICS`](../../reference/env-variables.md#FRONTEND_ANALYTICS) set, only users with the [PostHog](https://posthog.com/docs/feature-flags) feature flag `transcription-summary` can.

The variables are under [Transcription](../../reference/env-variables.md#transcription) for the backend and [Summary service](../../reference/env-variables.md#summary-service).

## Requirements

- **[Recording](recording.md), set up and working.** Transcription uses the same Egress, storage and webhook.
- **A WhisperX API.** The summary service calls `POST {WHISPERX_BASE_URL}/audio/transcriptions` with `response_format=diarized_json` and needs speaker labels and word segments back. [meet-whisperx](https://github.com/suitenumerique/meet-whisperx) serves them under `/v1`, so [`WHISPERX_BASE_URL`](../../reference/env-variables.md#WHISPERX_BASE_URL) ends in `/v1`. Run it on a GPU.
- **An LLM API.** The summary service needs [`LLM_BASE_URL`](../../reference/env-variables.md#LLM_BASE_URL), [`LLM_API_KEY`](../../reference/env-variables.md#LLM_API_KEY) and [`LLM_MODEL`](../../reference/env-variables.md#LLM_MODEL) to start, even with summaries off.
- **LaSuite Docs, to deliver the transcript.** Set the [LaSuite Docs](../../reference/env-variables.md#lasuite-docs) variables in the summary service's environment. Without [`IS_LASUITE_DOCS_INTEGRATION_ENABLED`](../../reference/env-variables.md#IS_LASUITE_DOCS_INTEGRATION_ENABLED), the transcript stays under `transcripts/` in the bucket and reaches no user.
- **`"allowed_push_to_docs": true` on each tenant**, even with the push off, as [`AUTHORIZED_TENANTS`](../../reference/env-variables.md#AUTHORIZED_TENANTS) explains.

The summary service rejects a transcription whose language is outside [`WHISPERX_ALLOWED_LANGUAGES`](../../reference/env-variables.md#WHISPERX_ALLOWED_LANGUAGES).

## Setup

### Step 1: Summary service environment

The summary service and its Celery workers take one environment. They use the backend's bucket, with the same keys and region:

- [`AWS_S3_SECURE_ACCESS`](../../reference/env-variables.md#AWS_S3_SECURE_ACCESS) picks HTTP or HTTPS: `False` for the Recording guide's Garage.
- The storage must serve path-style links, `<endpoint>/<bucket>/<key>`.
- On storage built on Google Cloud Storage, set [`AWS_S3_REQUEST_CHECKSUM_CALCULATION`](../../reference/env-variables.md#AWS_S3_REQUEST_CHECKSUM_CALCULATION) and [`AWS_S3_RESPONSE_CHECKSUM_VALIDATION`](../../reference/env-variables.md#AWS_S3_RESPONSE_CHECKSUM_VALIDATION) to `when_required`: it refuses the default checksums of boto3, the AWS SDK for Python.

[`AUTHORIZED_TENANTS`](../../reference/env-variables.md#AUTHORIZED_TENANTS) holds a separate strong secret in its `api_key` and its `webhook_api_key`, which Step 3 gives the backend. On Docker Compose the secrets script generates both; on Kubernetes, take each from `openssl rand -hex 32`.

=== "Docker Compose"

    Download the summary service's environment, and the metadata collector's for Step 4, then fill their secrets and your domain with the Meet stack's script:

    ```bash
    cd ~/docker/meet
    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
    curl -fsSL --output-dir env.d --remote-name-all \
      $RAW/env.d/production.dist/{summary,metadata-collector}
    ```

    ```console
    $ bash generate-secrets.sh
    ...
    set AWS_S3_ACCESS_KEY_ID in summary
    set AWS_S3_ACCESS_KEY_ID in metadata-collector
    set AWS_S3_SECRET_ACCESS_KEY in summary
    set AWS_S3_SECRET_ACCESS_KEY in metadata-collector
    set LIVEKIT_API_SECRET in metadata-collector
    added SUMMARY_SERVICE_API_TOKEN to common
    set SUMMARY_SERVICE_API_TOKEN in summary
    added SUMMARY_SERVICE_WEBHOOK_API_TOKEN to common
    set SUMMARY_SERVICE_WEBHOOK_API_TOKEN in summary
    set the webhook domain in summary
    kept LIVEKIT_API_SECRET in livekit-server.yaml: no placeholder left
    ```

    Then put your WhisperX, LLM and LaSuite Docs values in place of these lines of `env.d/summary`:

    ```dotenv title="env.d/summary"
    WHISPERX_BASE_URL=http://whisperx:8000/v1
    WHISPERX_API_KEY=your-api-key
    LLM_BASE_URL=https://your-llm-api.example.com/v1
    LLM_API_KEY=your-llm-api-key
    LLM_MODEL=gpt-4o-mini
    LASUITE_DOCS_BASE_URL=https://docs.example.com
    LASUITE_DOCS_SERVER_TO_SERVER_API_KEY=your-docs-api-key
    ```

    With another storage, put the endpoint, region and bucket of `env.d/common` in the Object storage lines of both files: the script copied only the keys. Both take the endpoint with or without its scheme, since [`AWS_S3_SECURE_ACCESS`](../../reference/env-variables.md#AWS_S3_SECURE_ACCESS) picks HTTP or HTTPS: set it to `True` in both for HTTPS.

=== "Kubernetes"

    Under `summary` in your `values.yaml`, set `replicas: 1` and uncomment `envVars`. Its `&summaryEnv` anchor lets Step 2 reuse the block, and its S3 keys come from the `garage-secrets` Secret of the Recording guide. With another storage, put the endpoint, region, bucket and keys of `backend.envVars` there, and set `AWS_S3_SECURE_ACCESS` to `"True"` for HTTPS.

    Then put a secret from `openssl rand -hex 32` in each `<generate-a-strong-secret>`, and your WhisperX, LLM and LaSuite Docs values in place of the `WHISPERX_`, `LLM_` and `LASUITE_DOCS_` examples.

### Step 2: Summary service and workers

=== "Docker Compose"

    The Meet stack's `compose.yml` holds the summary service, its Redis and its two workers under the `transcription` profile. Add it to [`COMPOSE_PROFILES`](https://docs.docker.com/compose/how-tos/profiles/) in the stack's `.env`, after the Recording guide's `recording`:

    ```dotenv title=".env"
    COMPOSE_PROFILES=recording,transcription
    ```

    Step 3 starts them.

=== "Kubernetes"

    The [Helm Deployment](../kubernetes/helm.md#download-the-values) values turn the workers off. Turn them back on in your `values.yaml`, with the Step 1 environment:

    - Uncomment `envVars: *summaryEnv` under `celeryTranscribe`, `celerySummarize` and `celerySummaryBackend`. `celerySummarize` runs only for [LLM summaries](#llm-summaries).
    - Under `celeryTranscribe`, delete `instances: []` and uncomment the `instances` list below it.
    - Set `replicas: 1` under `celerySummaryBackend`.

### Step 3: Connect the Meet backend

=== "Docker Compose"

    Uncomment the two AI transcription lines of `env.d/common`, [`SUMMARY_SERVICE_VERSION`](../../reference/env-variables.md#SUMMARY_SERVICE_VERSION) and [`SUMMARY_SERVICE_ENDPOINT`](../../reference/env-variables.md#SUMMARY_SERVICE_ENDPOINT). Step 1's script already added the two tokens.

    Start the summary service, and recreate every container reading `env.d/common`:

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    Uncomment the four `SUMMARY_SERVICE_` lines of `backend.envVars` in your `values.yaml`, and put Step 1's `api_key` and `webhook_api_key` in place of the two tokens' placeholders. Then apply them:

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

### Step 4: Name the speakers

Without this step, speakers stay labelled `SPEAKER_00`, `SPEAKER_01` and so on. The [metadata collector](../../overview/how-meet-works.md#transcription-and-summary) is what names them.

With [`FRONTEND_ANALYTICS`](../../reference/env-variables.md#FRONTEND_ANALYTICS) set, the agent joins only transcriptions started by a user with the PostHog feature flag `metadata-collector`. Every agent variable is in [Metadata collector agent](../../reference/env-variables.md#metadata-collector-agent).

=== "Docker Compose"

    Uncomment [`METADATA_COLLECTOR_ENABLED`](../../reference/env-variables.md#METADATA_COLLECTOR_ENABLED) in `env.d/common`.

    Its environment, `env.d/metadata-collector`, came with Step 1, its secrets filled. `compose.yml` holds the agent under the `metadata-collector` profile: add it to `COMPOSE_PROFILES` in `.env`:

    ```dotenv title=".env"
    COMPOSE_PROFILES=recording,transcription,metadata-collector
    ```

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    The chart runs the agent as `agentMetadata`, which the Helm Deployment values turn off. Turn it on in your `values.yaml`:

    - Under `agentMetadata`, set `replicas: 1` and uncomment `command` and `envVars`. With another storage, put the endpoint, region, bucket and keys of `backend.envVars` in its `AWS_S3_` and bucket lines, and add `AWS_S3_SECURE_ACCESS: "True"` for HTTPS: the agent defaults to HTTP.
    - Uncomment `METADATA_COLLECTOR_ENABLED` in `backend.envVars`.

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

## LLM summaries

Summarization writes a summary of the transcript with an LLM and pushes it to LaSuite Docs as a second document. Summaries run only when all of these hold:

- The push to LaSuite Docs is enabled.
- The person who started the transcription has the feature flag `summary-enabled`. Meet reads it from the analytics backend that [`ANALYTICS_BACKEND`](../../reference/env-variables.md#ANALYTICS_BACKEND) names, such as PostHog, or from a static list when no backend is set.
- [`IS_SUMMARY_ENABLED=True`](../../reference/env-variables.md#IS_SUMMARY_ENABLED) in the summary service, its default.
- A worker consumes `summarize-queue-v2`: on Kubernetes, `celerySummarize` with `replicas: 1`; on Docker Compose, `celery-summary-summarize`, under the `summaries` profile. Add `summaries` after the profiles already in `.env`, keeping `metadata-collector` if Step 4 added it: `COMPOSE_PROFILES=recording,transcription,metadata-collector,summaries`.

The LLM variables are in [Summaries (LLM)](../../reference/env-variables.md#summaries-llm), and the analytics ones in [Analytics and marketing](../../reference/env-variables.md#analytics-and-marketing).

Without an analytics backend, leave [`ANALYTICS_BACKEND`](../../reference/env-variables.md#ANALYTICS_BACKEND) unset and declare the flag in [`ANALYTICS_BACKEND_SETTINGS`](../../reference/env-variables.md#ANALYTICS_BACKEND_SETTINGS). It then holds for every user, and the backend sends no analytics data.

The value is a Python dictionary, not JSON: write `True`, not `true`. Set it on every container running the backend image, the Celery worker included.

=== "Docker Compose"

    Uncomment [`ANALYTICS_BACKEND_SETTINGS`](../../reference/env-variables.md#ANALYTICS_BACKEND_SETTINGS) in `env.d/common`, which the Celery worker reads too:

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    Uncomment `ANALYTICS_BACKEND_SETTINGS` in `backend.envVars` of your `values.yaml`, which the `celeryBackend` worker inherits:

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```
