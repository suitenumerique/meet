# Real-time Subtitles

A LiveKit agent turns speech into live captions with a speech-to-text (STT) provider, as [How do live subtitles work?](../../overview/how-meet-works.md#subtitles) shows.

## Who sees it, and what it costs

- Any participant can start subtitles, anonymous ones in a public room included.
- The **Show subtitles** button shows on computers only.
- With [`FRONTEND_ANALYTICS`](../../reference/env-variables.md#FRONTEND_ANALYTICS) set, it shows only to users with the [PostHog](https://posthog.com/docs/feature-flags) feature flag `subtitles`.

The [multi-user transcriber agent](https://github.com/suitenumerique/meet/blob/main/src/agents/multi_user_transcriber.py) opens one STT stream per participant, for as long as the room runs. So the provider's bill grows with participants × time, and the agent's CPU, memory and network with participants, though one agent serves several rooms.

## Setup

### Step 1: Backend

[`ROOM_SUBTITLE_AGENT_NAME`](../../reference/env-variables.md#ROOM_SUBTITLE_AGENT_NAME) must match the agent's [`TRANSCRIBER_AGENT_NAME`](../../reference/env-variables.md#TRANSCRIBER_AGENT_NAME), see [Environment Variables: Subtitles](../../reference/env-variables.md#subtitles).

=== "Docker Compose"

    Add to `env.d/common`:

    ```dotenv title="env.d/common"
    ROOM_SUBTITLE_ENABLED=True
    ROOM_SUBTITLE_AGENT_NAME=multi-user-transcriber
    ```

=== "Kubernetes"

    Add to `backend.envVars` in your `values.yaml`:

    ```yaml title="values.yaml"
    backend:
      envVars:
        ROOM_SUBTITLE_ENABLED: "True"
        ROOM_SUBTITLE_AGENT_NAME: "multi-user-transcriber"
    ```

### Step 2: Agent

Every agent variable, with its default, is in [Environment Variables: Subtitles agent](../../reference/env-variables.md#subtitles-agent).

=== "Docker Compose"

    Download the agent's environment, then fill its LiveKit secret with the Meet stack's script:

    ```bash
    cd ~/docker/meet
    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
    curl -fsSL --output-dir env.d --remote-name-all \
      $RAW/env.d/production.dist/multi-user-transcriber
    ```

    ```console
    $ bash generate-secrets.sh
    ...
    set LIVEKIT_API_SECRET in multi-user-transcriber
    kept LIVEKIT_API_SECRET in livekit-server.yaml: no placeholder left
    ```

    Then put your provider's key in place of `your-deepgram-api-key` in `env.d/multi-user-transcriber`, or set `STT_PROVIDER` and the lines of another provider there:

    ```dotenv title="env.d/multi-user-transcriber"
    STT_PROVIDER=deepgram
    DEEPGRAM_API_KEY=your-deepgram-api-key
    ```

    Add the agent to `compose.yml`, under `services:`:

    ```yaml title="compose.yml"
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

    Start the agent, and recreate the backend with Step 1's settings:

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    The chart runs the agent as `agentSubtitles`, which the [Helm Deployment](../kubernetes/helm.md#download-the-values) values turn off. Put the Deepgram API key in a Secret:

    ```bash
    kubectl -n meet create secret generic meet-deepgram \
      --from-literal=api-key="<your Deepgram API key>"
    ```

    Then turn the agent on in your `values.yaml`:

    ```yaml title="values.yaml"
    agentSubtitles:
      replicas: 1
      envVars:
        LIVEKIT_URL: "ws://livekit-server:7880"
        LIVEKIT_API_KEY: "meet"
        LIVEKIT_API_SECRET:
          secretKeyRef:
            name: meet-backend-env
            key: LIVEKIT_API_SECRET
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

| | Deepgram | Kyutai Moshi | Voxtral via vLLM |
|---|---|---|---|
| [`STT_PROVIDER`](../../reference/env-variables.md#STT_PROVIDER) | `deepgram` | `kyutai` | `voxtral-vllm` |
| Runs | In Deepgram's cloud | Self-hosted, on a GPU | Self-hosted, on a GPU |
| Setup | Sign up at [deepgram.com](https://deepgram.com/) and create an API key | Deploy a [Kyutai STT](https://github.com/kyutai-labs/delayed-streams-modeling) service | Deploy [vLLM](https://docs.vllm.ai/) serving [Voxtral](https://mistral.ai/news/voxtral), `mistralai/Voxtral-Mini-4B-Realtime-2602` or a compatible model, with a realtime WebSocket endpoint |
| Cost | Per minute | Your infrastructure only | Your infrastructure only |
| Audio | Sent to Deepgram | Stays on your servers | Stays on your servers |
| Notes | Many languages | | Keep [`ENABLE_SILERO_VAD=true`](../../reference/env-variables.md#ENABLE_SILERO_VAD): voxtral-vllm has no server-side endpointing, the detection of when a speaker stops |

## Test it

1. Join a room from a browser.
2. Click **Show subtitles** in the meeting controls.
3. Speak: captions appear.

When they do not, see [Subtitles issues](../../reference/troubleshooting.md#subtitles-issues), and check the agent's logs for errors:

```bash
docker compose logs -f multi-user-transcriber
```
