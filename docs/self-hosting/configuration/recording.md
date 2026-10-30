# Recording

Meet records a meeting with [LiveKit Egress](https://github.com/livekit/egress), which uploads the file to S3-compatible storage, then emails a download link. [How does recording work?](../../overview/how-meet-works.md#recording) follows one end to end.

## Who can record

| Room access level | Who can start and stop a recording |
|---|---|
| `public` or `trusted` | The room's host and co-hosts, and any signed-in participant connected to the meeting |
| `restricted` | The room's host and co-hosts only |

Set [`RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED=False`](../../reference/env-variables.md#RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED) to restrict recording to the room's host and co-hosts on every room.

A recording keeps the room's roles from when it started:

| Person | Can watch and download | Can delete |
|---|---|---|
| The room's host and co-hosts | Yes | Yes, once it has ended |
| The person who started it, when not a host or co-host | Yes | No |

## Setup

Set up [Email (SMTP)](email.md) first: the download link reaches users by email.

### Step 1: Object storage

!!! note "Another S3-compatible provider"
    To use AWS S3, Scaleway Object Storage, OVHcloud Object Storage or another, skip this step and put its endpoint, keys and region in the [`AWS_S3_*` variables](../../reference/env-variables.md#object-storage-s3) of Step 3.

    [AI transcription](transcription.md) reads its own copy of the endpoint, keys, region and bucket: `env.d/summary` and `env.d/metadata-collector` on Docker Compose, the `summary` and `agentMetadata` blocks of `values.yaml` on Kubernetes.

    Keep the bucket private: the backend authorizes each download, as Step 4 sets up.

[Garage](https://garagehq.deuxfleurs.fr/) runs here as a single node with no replication. Its first start creates the access key and the `meet-media-storage` bucket, and later starts leave both untouched: set the keys before that start.

=== "Docker Compose"

    Garage runs as its own stack, from [`docs/examples/garage/`](https://github.com/suitenumerique/meet/tree/main/docs/examples/garage):

    ```bash
    mkdir -p ~/docker/garage && cd ~/docker/garage

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL --remote-name-all $RAW/docs/examples/garage/{compose.yml,garage.toml}
    curl -fsSL -o .env $RAW/docs/examples/garage/.env.example
    ```

    Fill its secrets, and Meet's S3 keys, with the Meet stack's script:

    ```console
    $ cd ~/docker/meet
    $ bash generate-secrets.sh
    kept DJANGO_SECRET_KEY in common: already set
    kept LIVEKIT_API_SECRET in common: already set
    kept OIDC_RP_CLIENT_SECRET in common: already set
    kept DB_PASSWORD in postgresql: already set
    set GARAGE_RPC_SECRET in .env
    set GARAGE_ACCESS_KEY in .env
    set GARAGE_SECRET_KEY in .env
    added AWS_S3_ACCESS_KEY_ID to common
    added AWS_S3_SECRET_ACCESS_KEY to common
    kept LIVEKIT_API_SECRET in livekit-server.yaml: no placeholder left
    ```

    Start Garage and check that it created the bucket. It joins the Meet stack's network, `meet_internal`; for a Meet stack outside `~/docker/meet`, set `MEET_INTERNAL_NETWORK` in `.env` first:

    ```bash
    cd ~/docker/garage
    docker compose up -d
    docker compose exec garage /garage bucket info meet-media-storage
    ```

=== "Kubernetes"

    Download the manifests of Garage and of Step 2's Egress:

    ```bash
    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    K8S=$RAW/docs/examples/kubernetes
    curl -fsSL --remote-name-all $K8S/{garage,livekit-egress,livekit-egress-deployment}.yaml
    ```

    Store Garage's secrets in a Secret named `garage-secrets`. The backend reads the two keys from it in Step 3:

    ```bash
    kubectl -n meet create secret generic garage-secrets \
      --from-literal=GARAGE_RPC_SECRET="$(openssl rand -hex 32)" \
      --from-literal=GARAGE_DEFAULT_ACCESS_KEY="$(openssl rand -hex 12)" \
      --from-literal=GARAGE_DEFAULT_SECRET_KEY="$(openssl rand -hex 32)"
    ```

    Apply [`garage.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/kubernetes/garage.yaml), one Garage node with a 50 GiB volume, then check that it created the bucket:

    ```bash
    kubectl apply -f garage.yaml
    kubectl -n meet exec garage-0 -- /garage bucket info meet-media-storage
    ```

### Step 2: LiveKit Egress

Egress reads [`livekit-egress.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/livekit-egress.yaml). Its `cpu_cost` lets Egress accept recordings on a server with fewer than 4 cores, see [Recording fails immediately](../../reference/troubleshooting.md#recording-fails-immediately-no-response-from-servers).

=== "Docker Compose"

    Download its config into the Meet stack:

    ```bash
    cd ~/docker/meet
    curl -fsSL -O $RAW/docs/examples/meet/livekit-egress.yaml
    ```

    Then run `bash generate-secrets.sh` in `~/docker/meet`: it fills `<your LiveKit API secret>`.

    `compose.yml` holds Egress under the `recording` profile. Turn it on with [`COMPOSE_PROFILES`](https://docs.docker.com/compose/how-tos/profiles/) in the Meet stack's `.env`, comma-separated after any profile already there:

    ```dotenv title=".env"
    COMPOSE_PROFILES=recording
    ```

    Step 3 starts Egress.

=== "Kubernetes"

    Egress is not part of the Meet Helm chart. The Kubernetes [`livekit-egress.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/kubernetes/livekit-egress.yaml) of Step 1 points at the `livekit-server` and `redis-master` services, and the [Deployment](https://github.com/suitenumerique/meet/blob/main/docs/examples/kubernetes/livekit-egress-deployment.yaml) passes it [`LIVEKIT_API_SECRET`](../../reference/env-variables.md#LIVEKIT_API_SECRET) from the `meet-backend-env` Secret:

    ```bash
    kubectl -n meet create configmap livekit-egress-config --from-file=livekit-egress.yaml
    kubectl apply -f livekit-egress-deployment.yaml
    ```

### Step 3: Meet backend

=== "Docker Compose"

    Uncomment the Recording lines of `env.d/common`. They point at the Garage of Step 1, whose two keys Step 1's script already added. With another storage, put its endpoint, region and bucket in those lines, and add its keys as [`AWS_S3_ACCESS_KEY_ID`](../../reference/env-variables.md#AWS_S3_ACCESS_KEY_ID) and [`AWS_S3_SECRET_ACCESS_KEY`](../../reference/env-variables.md#AWS_S3_SECRET_ACCESS_KEY).

    Start Egress, and recreate every container reading `env.d/common`:

    ```bash
    docker compose up -d
    ```

=== "Kubernetes"

    In your `values.yaml`, uncomment the Recording lines of `backend.envVars`, which take the two keys from the Secret of Step 1, then apply them:

    ```bash
    helm upgrade meet meet/meet -n meet -f values.yaml
    ```

Check that recording is enabled, with [jq](https://jqlang.org/):

```console
$ curl -s https://meet.example.com/api/v1.0/config/ | jq .recording.is_enabled
true
```

### Step 4: Route recording downloads

Downloads go through `https://meet.example.com/media/`: the proxy gets signed headers from the backend, then fetches the file from the storage, with the `Host` header of [`AWS_S3_ENDPOINT_URL`](../../reference/env-variables.md#AWS_S3_ENDPOINT_URL).

=== "Docker Compose"

    Uncomment the Recording downloads block at the end of `nginx-routing.conf`, the `/media/` and `/media-auth` locations. It points at the Garage of Step 1: with another storage, put its host and bucket in place of `garage:9000` and `meet-media-storage`. Then restart the frontend, which runs this nginx:

    ```bash
    docker compose restart frontend
    ```

=== "Kubernetes"

    The chart's `ingressMedia` does the same, with nginx-ingress only. In your `values.yaml`, it points at the Garage of Step 1: with another storage, set `upstream-vhost` and `serviceMedia` to its address, and its bucket in `rewrite-target`. Then set `enabled: true` under `ingressMedia` and apply it:

    ```bash
    helm upgrade meet meet/meet -n meet -f values.yaml
    ```

## Configuring recording encoding

Meet encodes every screen recording with a **resolution** and a **profile**, which sets the framerate and the video bitrate for each resolution. The default, the `full` profile at `720p`, makes larger files than talking heads and screen sharing need.

### Built-in profiles

Egress CPU cost grows with the framerate and resolution. The size column adds the default 128 kbps audio to the 720p video bitrate:

| Profile | FPS | 540p kbps | 720p kbps | 1080p kbps | ~size per hour at 720p | Best for |
|---|---|---|---|---|---|---|
| `talking_heads` | 15 | 400 | 700 | 1200 | ~370 MB | Talking-head meetings with occasional slides |
| `text` | 15 | 600 | 1000 | 1800 | ~510 MB | Frequent screen sharing: slides, documents, code |
| `mixed` | 20 | 900 | 1500 | 2500 | ~730 MB | Mixed content, moderate motion |
| `full` | 30 | 2000 | 3000 | 4500 | ~1.4 GB | Highest fidelity, closest to LiveKit's preset |

Choosing a profile:

- For slide-heavy meetings, use `text`. At 720p, text blurs below about 40 kbit per frame, the bitrate divided by the framerate: `talking_heads` gives 47, `text` 67. Lower the framerate before the bitrate.
- If meetings include music, keep audio at 128 kbps. AAC at 64 kbps stereo suits voice but compresses music noticeably.

Change the default for every recording with [`RECORDING_ENCODING_DEFAULT_RESOLUTION`](../../reference/env-variables.md#RECORDING_ENCODING_DEFAULT_RESOLUTION) and [`RECORDING_ENCODING_DEFAULT_PROFILE`](../../reference/env-variables.md#RECORDING_ENCODING_DEFAULT_PROFILE). For example, for smaller files:

```dotenv title="env.d/common"
RECORDING_ENCODING_DEFAULT_RESOLUTION=720p
RECORDING_ENCODING_DEFAULT_PROFILE=talking_heads
RECORDING_ENCODING_AUDIO_BITRATE_KBPS=64
# How finely a player can seek. The default, 0.0, leaves it to the encoder
RECORDING_ENCODING_KEY_FRAME_INTERVAL_S=4.0
```

To let LiveKit pick the whole encoding instead, set either default to an empty value, as [`RECORDING_ENCODING_DEFAULT_RESOLUTION`](../../reference/env-variables.md#RECORDING_ENCODING_DEFAULT_RESOLUTION) describes.

### Letting users choose

With [`RECORDING_CUSTOM_ENCODING_ENABLED=True`](../../reference/env-variables.md#RECORDING_CUSTOM_ENCODING_ENABLED), the room's host and co-hosts pick the profile and resolution of each recording in the settings dialog's **Recording** tab.

### Your own resolutions and profiles

[`RECORDING_ENCODING_AVAILABLE_RESOLUTIONS`](../../reference/env-variables.md#RECORDING_ENCODING_AVAILABLE_RESOLUTIONS) and [`RECORDING_ENCODING_AVAILABLE_PROFILES`](../../reference/env-variables.md#RECORDING_ENCODING_AVAILABLE_PROFILES) replace the built-in sets. Each is a dictionary on a single line, with double-quoted keys and no outer quotes in an env file:

```dotenv title="env.d/common"
RECORDING_ENCODING_AVAILABLE_RESOLUTIONS={"540p": {"width": 960, "height": 540}, "720p": {"width": 1280, "height": 720}, "1080p": {"width": 1920, "height": 1080}}
RECORDING_ENCODING_AVAILABLE_PROFILES={"small": {"fps": 15, "kbps": {"540p": 350, "720p": 600, "1080p": 1100}}}
RECORDING_ENCODING_DEFAULT_PROFILE=small
```

- Each profile must have a bitrate for exactly the available resolutions, as [`RECORDING_ENCODING_AVAILABLE_PROFILES`](../../reference/env-variables.md#RECORDING_ENCODING_AVAILABLE_PROFILES) requires, so replacing one set usually means replacing both.
- The two defaults must name entries of these sets.
- The **Recording** tab has labels for the four built-in profiles only.

## Test it

1. Start a meeting, open **More tools** → **Record**, and click **Start recording the meeting**.
2. Speak for 30 seconds, then click **Stop recording the meeting**.
3. Run the bucket check of Step 1 again, from `~/docker/garage` on Docker Compose: the object count has gone up by two, the `.mp4` and the `.json` manifest Egress writes beside it.
4. Check the recording's status under `/admin/` → **Core → Recordings**.
5. Check that the email with the download link arrived.

While a recording runs, the [LiveKit CLI](https://github.com/livekit/livekit-cli) lists the active Egress jobs and their state:

```bash
SECRET=$(sed -n 's/^LIVEKIT_API_SECRET=//p' ~/docker/meet/env.d/common)
lk egress list --url https://livekit.example.com --api-key meet --api-secret "$SECRET"
```

## What it cannot do

- The video layout is fixed to LiveKit's `speaker-light`.
- No shareable link with an embedded video player.
