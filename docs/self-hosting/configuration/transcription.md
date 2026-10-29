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

=== "Kubernetes"

    Add to your `values.yaml`. The `&summaryEnv` anchor lets Step 2 reuse the block, and the S3 keys come from the `garage-secrets` Secret of the Recording guide:

    ```yaml title="values.yaml"
    summary:
      replicas: 1
      envVars: &summaryEnv
        CELERY_BROKER_URL: "redis://redis-master:6379/1"
        CELERY_RESULT_BACKEND: "redis://redis-master:6379/1"
        AWS_S3_ENDPOINT_URL: "http://garage.meet.svc.cluster.local:9000"
        AWS_S3_ACCESS_KEY_ID:
          secretKeyRef:
            name: garage-secrets
            key: GARAGE_DEFAULT_ACCESS_KEY
        AWS_S3_SECRET_ACCESS_KEY:
          secretKeyRef:
            name: garage-secrets
            key: GARAGE_DEFAULT_SECRET_KEY
        AWS_S3_REGION_NAME: "garage"
        AWS_STORAGE_BUCKET_NAME: "meet-media-storage"
        AWS_S3_SECURE_ACCESS: "False"
        AUTHORIZED_TENANTS: |
          [{
            "id": "meet",
            "api_key": "<generate-a-strong-secret>",
            "webhook_url": "https://meet.example.com/api/v1.0/recordings/external-process-hook/",
            "webhook_api_key": "<generate-a-strong-secret>",
            "allowed_push_to_docs": true
          }]
        WHISPERX_BASE_URL: "http://whisperx:8000/v1"
        WHISPERX_ASR_MODEL: "large-v3"
        WHISPERX_API_KEY: "your-api-key"
        LLM_BASE_URL: "https://your-llm-api.example.com/v1"
        LLM_API_KEY: "your-llm-api-key"
        LLM_MODEL: "gpt-4o-mini"
        IS_LASUITE_DOCS_INTEGRATION_ENABLED: "True"
        LASUITE_DOCS_BASE_URL: "https://docs.example.com"
        LASUITE_DOCS_SERVER_TO_SERVER_API_KEY: "your-docs-api-key"
    ```

### Step 2: Summary service and workers

=== "Docker Compose"

    Add to the Meet stack's `compose.yml`, under `services:`:

    ```yaml title="compose.yml"
      # The Celery broker
      redis-summary:
        image: redis:7
        restart: unless-stopped
        networks:
          - internal

      # The API
      app-summary:
        image: lasuite/meet-summary:${MEET_VERSION:-latest}
        restart: unless-stopped
        env_file:
          - env.d/summary
        depends_on:
          - redis-summary
        networks:
          - internal

      # Transcribes
      celery-summary-transcribe:
        image: lasuite/meet-summary:${MEET_VERSION:-latest}
        restart: unless-stopped
        command: celery -A summary.core.celery_worker worker --pool=solo -Q transcribe-queue-v2
        env_file:
          - env.d/summary
        depends_on:
          - redis-summary
        networks:
          - internal

      # Sends the result back to Meet
      celery-summary-webhook:
        image: lasuite/meet-summary:${MEET_VERSION:-latest}
        restart: unless-stopped
        command: celery -A summary.core.celery_worker worker --pool=solo -Q call-webhook-queue-v2
        env_file:
          - env.d/summary
        depends_on:
          - redis-summary
        networks:
          - internal
    ```

    Step 3 starts them.

=== "Kubernetes"

    Turn the workers back on, since the [Helm Deployment](../kubernetes/helm.md#download-the-values) values turn them off, and give them the Step 1 environment:

    ```yaml title="values.yaml"
    celeryTranscribe:
      envVars: *summaryEnv
      instances:
        - name: transcribe-1
          replicas: 1

    # Summaries only, see LLM summaries below
    celerySummarize:
      envVars: *summaryEnv

    celerySummaryBackend:
      envVars: *summaryEnv
      replicas: 1
    ```

### Step 3: Connect the Meet backend

=== "Docker Compose"

    Add to `env.d/common`, beside the two tokens Step 1's script put there:

    ```dotenv title="env.d/common"
    SUMMARY_SERVICE_VERSION=2
    SUMMARY_SERVICE_ENDPOINT=http://app-summary:8000/api/v2/async-jobs/transcribe
    ```

    Start the summary service, and recreate every container reading `env.d/common`:

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    Add to `backend.envVars` in your `values.yaml`:

    ```yaml title="values.yaml"
    backend:
      envVars:
        SUMMARY_SERVICE_VERSION: "2"
        SUMMARY_SERVICE_ENDPOINT: "http://meet-summary:80/api/v2/async-jobs/transcribe"
        SUMMARY_SERVICE_API_TOKEN: "<same-api_key-you-set-in-AUTHORIZED_TENANTS>"
        SUMMARY_SERVICE_WEBHOOK_API_TOKEN: "<same-webhook_api_key-you-set-in-AUTHORIZED_TENANTS>"
    ```

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

### Step 4: Name the speakers

Without this step, speakers stay labelled `SPEAKER_00`, `SPEAKER_01` and so on. The [metadata collector](../../overview/how-meet-works.md#transcription-and-summary) is what names them.

With [`FRONTEND_ANALYTICS`](../../reference/env-variables.md#FRONTEND_ANALYTICS) set, the agent joins only transcriptions started by a user with the PostHog feature flag `metadata-collector`. Every agent variable is in [Metadata collector agent](../../reference/env-variables.md#metadata-collector-agent).

=== "Docker Compose"

    Add [`METADATA_COLLECTOR_ENABLED=True`](../../reference/env-variables.md#METADATA_COLLECTOR_ENABLED) to `env.d/common`.

    Its environment, `env.d/metadata-collector`, came with Step 1, its secrets filled.

    Add the agent to `compose.yml`, under `services:`:

    ```yaml title="compose.yml"
      metadata-collector:
        image: lasuite/meet-agents:${MEET_VERSION:-latest}
        command: python metadata_collector.py start
        restart: unless-stopped
        env_file:
          - env.d/metadata-collector
        depends_on:
          - livekit
        networks:
          - internal
    ```

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    The chart runs the agent as `agentMetadata`, which the Helm Deployment values turn off. Turn it on in your `values.yaml`:

    ```yaml title="values.yaml"
    backend:
      envVars:
        METADATA_COLLECTOR_ENABLED: "True"

    agentMetadata:
      replicas: 1
      command: ["python", "metadata_collector.py", "start"]
      envVars:
        LIVEKIT_URL: "ws://livekit-server:7880"
        LIVEKIT_API_KEY: "meet"
        LIVEKIT_API_SECRET:
          secretKeyRef:
            name: meet-backend-env
            key: LIVEKIT_API_SECRET
        AWS_S3_ENDPOINT_URL: "garage.meet.svc.cluster.local:9000"
        AWS_S3_ACCESS_KEY_ID:
          secretKeyRef:
            name: garage-secrets
            key: GARAGE_DEFAULT_ACCESS_KEY
        AWS_S3_SECRET_ACCESS_KEY:
          secretKeyRef:
            name: garage-secrets
            key: GARAGE_DEFAULT_SECRET_KEY
        AWS_S3_REGION_NAME: "garage"
        AWS_STORAGE_BUCKET_NAME: "meet-media-storage"
    ```

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

## LLM summaries

Summarization writes a summary of the transcript with an LLM and pushes it to LaSuite Docs as a second document. Summaries run only when all of these hold:

- The push to LaSuite Docs is enabled.
- The person who started the transcription has the feature flag `summary-enabled`. Meet reads it from the analytics backend that [`ANALYTICS_BACKEND`](../../reference/env-variables.md#ANALYTICS_BACKEND) names, such as PostHog, or from a static list when no backend is set.
- [`IS_SUMMARY_ENABLED=True`](../../reference/env-variables.md#IS_SUMMARY_ENABLED) in the summary service, its default.
- A worker consumes `summarize-queue-v2`: on Kubernetes, `celerySummarize` with `replicas: 1`; on Docker Compose, a service like Step 2's `celery-summary-transcribe`, with `-Q summarize-queue-v2`.

The LLM variables are in [Summaries (LLM)](../../reference/env-variables.md#summaries-llm), and the analytics ones in [Analytics and marketing](../../reference/env-variables.md#analytics-and-marketing).

Without an analytics backend, leave [`ANALYTICS_BACKEND`](../../reference/env-variables.md#ANALYTICS_BACKEND) unset and declare the flag in [`ANALYTICS_BACKEND_SETTINGS`](../../reference/env-variables.md#ANALYTICS_BACKEND_SETTINGS). It then holds for every user, and the backend sends no analytics data.

The value is a Python dictionary, not JSON: write `True`, not `true`. Set it on every container running the backend image, the Celery worker included.

=== "Docker Compose"

    Add to `env.d/common`:

    ```dotenv title="env.d/common"
    ANALYTICS_BACKEND_SETTINGS={"feature_flags": {"summary-enabled": True}}
    ```

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    Add to `backend.envVars` in your `values.yaml`, which the `celeryBackend` worker inherits:

    ```yaml title="values.yaml"
    backend:
      envVars:
        ANALYTICS_BACKEND_SETTINGS: '{"feature_flags": {"summary-enabled": True}}'
    ```

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```
