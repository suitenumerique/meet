# Real-time Subtitles

A LiveKit agent turns speech into live captions with a speech-to-text (STT) provider, as [How do live subtitles work?](../../overview/how-meet-works.md#subtitles) shows.

## Who sees it, and what it costs

- Any participant can start subtitles, anonymous ones in a public room included.
- The **Show subtitles** button shows on computers only.
- With `FRONTEND_ANALYTICS` set, it shows only to users with the [PostHog](https://posthog.com/docs/feature-flags) feature flag `subtitles`.

The [multi-user transcriber agent](https://github.com/suitenumerique/meet/blob/main/src/agents/multi_user_transcriber.py) joins each room once and opens one STT stream per participant, for as long as the room runs. What subtitles cost:

- **Provider:** cost grows with participants × time.
- **Agent:** one instance serves several rooms at once, through LiveKit's dispatch. Its CPU, memory and network use grow with the participants in rooms with subtitles on.

## Setup

### Step 1: Backend

`ROOM_SUBTITLE_AGENT_NAME` must match the agent's `TRANSCRIBER_AGENT_NAME`, see [Environment Variables: Subtitles](../../reference/env-variables.md#subtitles).

=== "Docker Compose"

    Add to `env.d/common`:

    ```dotenv
    ROOM_SUBTITLE_ENABLED=True
    ROOM_SUBTITLE_AGENT_NAME=multi-user-transcriber
    ```

    ```bash
    docker compose up -d --force-recreate backend
    ```

=== "Kubernetes"

    Add to `backend.envVars` in your `values.yaml`:

    ```yaml
    backend:
      envVars:
        ROOM_SUBTITLE_ENABLED: "True"
        ROOM_SUBTITLE_AGENT_NAME: "multi-user-transcriber"
    ```

### Step 2: Agent

Every agent variable, with its default, is in [Environment Variables: Subtitles agent](../../reference/env-variables.md#subtitles-agent).

=== "Docker Compose"

    Create `env.d/multi-user-transcriber`. `<your LiveKit API secret>` is `LIVEKIT_API_SECRET` from `env.d/common`.

    ```dotenv
    LIVEKIT_URL=ws://livekit:7880
    LIVEKIT_API_KEY=meet
    LIVEKIT_API_SECRET=<your LiveKit API secret>

    # Choose STT provider: deepgram, kyutai or voxtral-vllm
    STT_PROVIDER=deepgram

    # With STT_PROVIDER=deepgram
    DEEPGRAM_API_KEY=your-deepgram-api-key
    DEEPGRAM_STT_MODEL=nova-3
    DEEPGRAM_STT_LANGUAGE=multi

    # With STT_PROVIDER=kyutai
    KYUTAI_STT_BASE_URL=http://kyutai-stt:8000
    KYUTAI_API_KEY=your-kyutai-api-key

    # Voice activity detection, on by default
    ENABLE_SILERO_VAD=true

    # Optional: Sentry error tracking
    SENTRY_DSN=
    SENTRY_ENVIRONMENT=production
    ```

    Add the agent to `compose.yml`, under `services:`:

    ```yaml
      multi-user-transcriber:
        image: lasuite/meet-agents:${MEET_VERSION:-latest}
        command: python multi_user_transcriber.py start
        restart: unless-stopped
        env_file:
          - env.d/multi-user-transcriber
        depends_on:
          - livekit
        networks:
          - internal
    ```

    ```bash
    docker compose up -d multi-user-transcriber
    ```

=== "Kubernetes"

    The chart always deploys the agent as `agentSubtitles`. Put the Deepgram API key in a Secret:

    ```bash
    kubectl -n meet create secret generic meet-deepgram \
      --from-literal=api-key="<your Deepgram API key>"
    ```

    Then configure the agent in your `values.yaml`. `<your LiveKit API secret>` is `LIVEKIT_API_SECRET` from the `meet-backend-env` Secret.

    ```yaml
    agentSubtitles:
      replicas: 1
      envVars:
        LIVEKIT_URL: "ws://livekit-server:7880"
        LIVEKIT_API_KEY: "meet"
        LIVEKIT_API_SECRET: "<your LiveKit API secret>"
        STT_PROVIDER: "deepgram"
        DEEPGRAM_STT_MODEL: "nova-3"
        DEEPGRAM_STT_LANGUAGE: "multi"
        ENABLE_SILERO_VAD: "true"
        DEEPGRAM_API_KEY:
          secretKeyRef:
            name: meet-deepgram
            key: api-key
    ```

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

## STT providers

Set `STT_PROVIDER` in the agent's environment, then the provider's variables in [Subtitles agent](../../reference/env-variables.md#subtitles-agent):

| | Deepgram | Kyutai Moshi | Voxtral via vLLM |
|---|---|---|---|
| `STT_PROVIDER` | `deepgram` | `kyutai` | `voxtral-vllm` |
| Runs | In Deepgram's cloud | Self-hosted, on a GPU | Self-hosted, on a GPU |
| Setup | Sign up at [deepgram.com](https://deepgram.com/) and create an API key | Deploy a [Kyutai STT](https://github.com/kyutai-labs/delayed-streams-modeling) service | Deploy [vLLM](https://docs.vllm.ai/) serving [Voxtral](https://mistral.ai/news/voxtral), `mistralai/Voxtral-Mini-4B-Realtime-2602` or a compatible model, with a realtime WebSocket endpoint |
| Cost | Per minute | Your infrastructure only | Your infrastructure only |
| Audio | Sent to Deepgram | Stays on your servers | Stays on your servers |
| Notes | Many languages, high accuracy | | Keep `ENABLE_SILERO_VAD=true`: voxtral-vllm has no server-side endpointing, the detection of when a speaker stops |

## Test it

1. Join a room from a browser.
2. Click **Show subtitles** in the meeting controls.
3. Speak: captions appear.

When they do not, see [Subtitles issues](../../reference/troubleshooting.md#subtitles-issues), and check the agent's logs for errors:

```bash
docker compose logs -f multi-user-transcriber
```
