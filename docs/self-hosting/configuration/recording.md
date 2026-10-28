# Recording

Meet records a meeting with [LiveKit Egress](https://github.com/livekit/egress), which captures the room and uploads the file to S3-compatible storage. When a screen recording is complete, the person who started it and the room's owners and co-hosts each receive an email with a download link. How a recording travels from the button to that email is in [How does recording work?](../../overview/how-meet-works.md#recording).

Every recording variable and its default is in [Environment Variables: Recording](../../reference/env-variables.md#recording). [`RECORDING_MAX_DURATION`](../../reference/env-variables.md#recording) is only the limit users see: set the same limit in LiveKit Egress, which stops the recording. When Egress stops a recording at its limit, Meet saves the file as usual.

**Known limitations:**

- Layout is fixed to LiveKit's `speaker-light`.
- Shareable links with an embedded video player are not yet supported.

## Who can record

| Room access level | Who can start and stop a recording |
|---|---|
| `public` or `trusted` | The room's owners and co-hosts, and any signed-in participant connected to the meeting |
| `restricted` | The room's owners and co-hosts only |

Set `RECORDING_AUTHENTICATED_PARTICIPANTS_ENABLED=False` to restrict recording to the room's owners and co-hosts on every room. A participant who joined without signing in can never record.

Meet copies the room's roles onto the recording when it starts, and later changes to the room do not affect it:

| Person | Can watch and download | Can delete |
|---|---|---|
| The room's owners and co-hosts | Yes | Yes, once it has ended |
| The person who started it, when not an owner or co-host | Yes | No |

Starting a recording is rate-limited per user, as [Rate limiting](../../reference/security.md#rate-limiting) lists.

## Requirements

- A running LiveKit Egress server.
- S3-compatible object storage. This guide self-hosts [Garage](https://garagehq.deuxfleurs.fr/), but any S3-compatible provider works, such as AWS S3, Scaleway Object Storage or OVHcloud Object Storage.
- SMTP, since the download link reaches users by email. See [Email (SMTP)](email.md).
- The LiveKit webhook to Meet, which tells Meet a recording has finished. The base setup already configures it: see the [Deployment Guide](../compose/deployment-guide.md#stack-3-meet-core).

## Setup

### Step 1: Object storage

To use an external S3-compatible provider instead of Garage, skip this step and use the provider's endpoint, keys and region in the `AWS_S3_*` variables of Step 3. The bucket stays private: the backend authorizes each download, as Step 4 sets up.

Garage runs here as a single node with no replication. On its first start it creates its access key and the `meet-media-storage` bucket, and it leaves both untouched on later starts. Garage refuses to start with an access key shorter than 8 characters or a secret key shorter than 16.

=== "Docker Compose"

    Garage runs as its own stack, from [`docs/examples/garage/`](https://github.com/suitenumerique/meet/tree/main/docs/examples/garage):

    ```bash
    mkdir -p ~/docker/garage && cd ~/docker/garage

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL -o compose.yml  ${RAW}/docs/examples/garage/compose.yml
    curl -fsSL -o garage.toml  ${RAW}/docs/examples/garage/garage.toml
    curl -fsSL -o .env         ${RAW}/docs/examples/garage/.env.example
    ```

    Generate the three secrets and write them into `.env`. Meet uses the access key and the secret key as its S3 keys in Step 3, so note both down:

    ```bash
    sed -i "s|GARAGE_RPC_SECRET=.*|GARAGE_RPC_SECRET=$(openssl rand -hex 32)|" .env
    sed -i "s|GARAGE_ACCESS_KEY=.*|GARAGE_ACCESS_KEY=$(openssl rand -hex 12)|" .env
    sed -i "s|GARAGE_SECRET_KEY=.*|GARAGE_SECRET_KEY=$(openssl rand -hex 32)|" .env
    grep -E "GARAGE_(ACCESS|SECRET)_KEY" .env
    ```

    The stack joins the Meet stack's `internal` network, named `meet_internal` when the Meet stack is in `~/docker/meet`. If yours has another name, set it as `MEET_INTERNAL_NETWORK` in `.env`. Start Garage:

    ```bash
    docker compose up -d
    ```

    Check that Garage created the bucket:

    ```bash
    docker compose exec garage /garage bucket info meet-media-storage
    ```

=== "Kubernetes"

    Store Garage's secrets in a Secret named `garage-secrets`. The backend reads the two keys from it in Step 3:

    ```bash
    kubectl -n meet create secret generic garage-secrets \
      --from-literal=GARAGE_RPC_SECRET="$(openssl rand -hex 32)" \
      --from-literal=GARAGE_DEFAULT_ACCESS_KEY="$(openssl rand -hex 12)" \
      --from-literal=GARAGE_DEFAULT_SECRET_KEY="$(openssl rand -hex 32)"
    ```

    Save this manifest as `garage.yaml`. It runs Garage as a one-replica StatefulSet with a 50 GiB volume, behind a Service named `garage`:

    ```yaml
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: garage-config
      namespace: meet
    data:
      garage.toml: |
        metadata_dir = "/var/lib/garage/meta"
        data_dir = "/var/lib/garage/data"
        db_engine = "lmdb"
        replication_factor = 1
        rpc_bind_addr = "127.0.0.1:3901"
        rpc_public_addr = "127.0.0.1:3901"

        [s3_api]
        api_bind_addr = "[::]:9000"
        s3_region = "garage"
    ---
    apiVersion: v1
    kind: Service
    metadata:
      name: garage
      namespace: meet
    spec:
      selector:
        app: garage
      ports:
        - name: s3
          port: 9000
          targetPort: s3
    ---
    apiVersion: apps/v1
    kind: StatefulSet
    metadata:
      name: garage
      namespace: meet
    spec:
      serviceName: garage
      replicas: 1
      selector:
        matchLabels:
          app: garage
      template:
        metadata:
          labels:
            app: garage
        spec:
          containers:
            - name: garage
              image: dxflrs/garage:v2.4.1
              command: ["/garage", "server", "--single-node", "--default-bucket"]
              env:
                - name: GARAGE_DEFAULT_BUCKET
                  value: meet-media-storage
              envFrom:
                - secretRef:
                    name: garage-secrets
              ports:
                - name: s3
                  containerPort: 9000
              readinessProbe:
                exec:
                  command: ["/garage", "health"]
                periodSeconds: 5
              volumeMounts:
                - name: config
                  mountPath: /etc/garage.toml
                  subPath: garage.toml
                - name: data
                  mountPath: /var/lib/garage
          volumes:
            - name: config
              configMap:
                name: garage-config
      volumeClaimTemplates:
        - metadata:
            name: data
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 50Gi
    ```

    Apply it, then check that Garage created the bucket:

    ```bash
    kubectl apply -f garage.yaml
    kubectl -n meet exec garage-0 -- /garage bucket info meet-media-storage
    ```

### Step 2: LiveKit Egress

Create `livekit-egress.yaml`. On Docker Compose, create it in `~/docker/meet`, beside the Meet stack's `compose.yml`:

```yaml
api_key: meet
api_secret: <your LiveKit API secret>
ws_url: ws://livekit:7880

redis:
  address: redis:6379

cpu_cost:
  room_composite_cpu_cost: 1.5
  track_composite_cpu_cost: 1.0
  track_cpu_cost: 0.5
```

- The `redis` section is mandatory. Egress talks to LiveKit server through Redis, and crashes at start without it.
- `cpu_cost` lets Egress accept recordings on a server with fewer than 4 cores. See [Recording fails immediately](../../reference/troubleshooting.md#recording-fails-immediately-no-response-from-servers).
- The file needs no `s3` section. Meet sends the storage settings with every recording request, built from the backend's `AWS_S3_*` variables of Step 3.
- On Kubernetes, point `ws_url` and `redis.address` at your LiveKit and Redis services, for example `ws://livekit-server:7880` and `redis-master:6379`, and set `api_key` to the key under `livekit.keys` in `livekit-values.yaml`, `myapikey` in [Helm Deployment](../kubernetes/helm.md#livekit-on-kubernetes).

=== "Docker Compose"

    Add to the Meet stack's `compose.yml`, under `services:`:

    ```yaml
      livekit-egress:
        image: livekit/egress:${EGRESS_VERSION:-latest}
        restart: unless-stopped
        environment:
          EGRESS_CONFIG_FILE: /livekit-egress.yaml
        volumes:
          - ./livekit-egress.yaml:/livekit-egress.yaml:ro
        depends_on:
          - redis
          - livekit
        networks:
          - internal
    ```

    ```bash
    cd ~/docker/meet
    docker compose up -d livekit-egress
    ```

=== "Kubernetes"

    Egress is not part of the Meet Helm chart. Store the file in a ConfigMap:

    ```bash
    kubectl -n meet create configmap livekit-egress-config --from-file=livekit-egress.yaml
    ```

    Then deploy Egress with this manifest, saved as `livekit-egress-deployment.yaml`:

    ```yaml
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: livekit-egress
      namespace: meet
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: livekit-egress
      template:
        metadata:
          labels:
            app: livekit-egress
        spec:
          containers:
          - name: livekit-egress
            image: livekit/egress:latest
            env:
            - name: EGRESS_CONFIG_FILE
              value: /config/livekit-egress.yaml
            volumeMounts:
            - name: config
              mountPath: /config
            resources:
              requests:
                cpu: 500m
                memory: 512Mi
              limits:
                memory: 2Gi
          volumes:
          - name: config
            configMap:
              name: livekit-egress-config
    ```

    ```bash
    kubectl apply -f livekit-egress-deployment.yaml
    ```

### Step 3: Meet backend

The backend and Egress both reach the storage at `AWS_S3_ENDPOINT_URL`, whose scheme sets HTTP or HTTPS. `AWS_S3_REGION_NAME` is the region requests are signed for: `garage` for the Garage of Step 1, your provider's region otherwise.

=== "Docker Compose"

    Add to `env.d/common`, with the two keys from Step 1:

    ```dotenv
    RECORDING_ENABLE=True
    AWS_S3_ENDPOINT_URL=http://garage:9000
    AWS_S3_ACCESS_KEY_ID=<GARAGE_ACCESS_KEY>
    AWS_S3_SECRET_ACCESS_KEY=<GARAGE_SECRET_KEY>
    AWS_S3_REGION_NAME=garage
    AWS_STORAGE_BUCKET_NAME=meet-media-storage
    RECORDING_DOWNLOAD_BASE_URL=https://meet.example.com/recording
    ```

    Recreate the backend and its worker:

    ```bash
    docker compose up -d --force-recreate backend celery
    ```

=== "Kubernetes"

    Add to `backend.envVars` in your `values.yaml`. The two keys come from the Secret of Step 1:

    ```yaml
    backend:
      envVars:
        RECORDING_ENABLE: "True"
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
        RECORDING_DOWNLOAD_BASE_URL: "https://meet.example.com/recording"
    ```

    The SMTP variables go in the same block, see [Email (SMTP)](email.md#kubernetes-setup).

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

Check that recording is enabled: `curl -s https://meet.example.com/api/v1.0/config/ | jq .recording.is_enabled` prints `true`.

### Step 4: Route recording downloads

The download button points to `https://meet.example.com/media/recordings/<id>.mp4`. The proxy asks the backend's `/api/v1.0/recordings/media-auth/` whether the user may retrieve it, then fetches the file from the storage with the signed headers the backend returns.

The backend signs for the host of `AWS_S3_ENDPOINT_URL`, so the `Host` header the proxy sends to the storage must equal that URL's `host:port`.

=== "Docker Compose"

    `nginx-routing.conf` ships with a commented-out `/media/` block. Uncomment it and replace the placeholders:

    | Placeholder | Value |
    |---|---|
    | `<OBJECT_STORAGE_HOST>` | `AWS_S3_ENDPOINT_URL`, for example `http://garage:9000` |
    | `<OBJECT_STORAGE_HOST_NO_SCHEME>` | The same without `http://` or `https://`, for the `Host` header |
    | `<BUCKET_NAME>` | `AWS_STORAGE_BUCKET_NAME` |

    With the Garage of Step 1, the block reads:

    ```nginx
    location /media/ {
        auth_request /media-auth;
        auth_request_set $authHeader $upstream_http_authorization;
        auth_request_set $authDate $upstream_http_x_amz_date;
        auth_request_set $authContentSha256 $upstream_http_x_amz_content_sha256;

        proxy_set_header Authorization $authHeader;
        proxy_set_header X-Amz-Date $authDate;
        proxy_set_header X-Amz-Content-SHA256 $authContentSha256;

        proxy_pass http://garage:9000/meet-media-storage/;
        proxy_set_header Host garage:9000;
    }

    location = /media-auth {
        internal;
        proxy_pass http://meet_backend/api/v1.0/recordings/media-auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Original-URL $request_uri;

        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
    }
    ```

    Restart the frontend container, which runs this nginx:

    ```bash
    docker compose restart frontend
    ```

=== "Kubernetes"

    The chart's `ingressMedia` does the same with nginx-ingress auth subrequests. Its annotations work with nginx-ingress only, not with other ingress controllers. `rewrite-target` sends `/media/<path>` to `/<bucket>/<path>` on the storage. `upstream-vhost` sets the `Host` header to the storage's `host:port`, and `serviceMedia` names the same storage.

    The chart's defaults for `serviceMedia.host` and `upstream-vhost` already point at `garage.meet.svc.cluster.local`, the Service of Step 1. With another storage, set both to its address. Add to `values.yaml`:

    ```yaml
    ingressMedia:
      enabled: true
      className: nginx
      host: meet.example.com
      annotations:
        cert-manager.io/cluster-issuer: letsencrypt-prod
        nginx.ingress.kubernetes.io/auth-url: "https://meet.example.com/api/v1.0/recordings/media-auth/"
        nginx.ingress.kubernetes.io/auth-response-headers: "Authorization, X-Amz-Date, X-Amz-Content-SHA256"
        nginx.ingress.kubernetes.io/upstream-vhost: "garage.meet.svc.cluster.local:9000"
        nginx.ingress.kubernetes.io/rewrite-target: /meet-media-storage/$1
        nginx.ingress.kubernetes.io/configuration-snippet: |
          add_header Content-Security-Policy "default-src 'none'" always;
      tls:
        enabled: true
        secretName: meet-tls

    serviceMedia:
      host: garage.meet.svc.cluster.local
      port: 9000
    ```

    ```bash
    helm upgrade meet meet/meet --namespace meet --values values.yaml
    ```

## Configuring recording encoding

Meet encodes every screen recording with a **resolution** and a **profile**, which sets the framerate and the video bitrate for each resolution.

- Transcript recordings are audio-only `.ogg` files: Meet ignores any encoding sent for them.
- Egress's codecs stay fixed: H.264 Main video and AAC audio.
- The default, the `full` profile at `720p`, matches LiveKit's built-in `H264_720P_30` preset, and makes larger files than talking heads and screen sharing need.

**Built-in profiles.** File size grows with the bitrate, and Egress CPU cost with the framerate and resolution. The size column adds the default 128 kbps audio to the 720p video bitrate:

| Profile | FPS | 540p kbps | 720p kbps | 1080p kbps | ~size per hour at 720p | Best for |
|---|---|---|---|---|---|---|
| `talking_heads` | 15 | 400 | 700 | 1200 | ~370 MB | Talking-head meetings with occasional slides |
| `text` | 15 | 600 | 1000 | 1800 | ~510 MB | Frequent screen sharing: slides, documents, code |
| `mixed` | 20 | 900 | 1500 | 2500 | ~730 MB | Mixed content, moderate motion |
| `full` | 30 | 2000 | 3000 | 4500 | ~1.4 GB | Highest fidelity, closest to LiveKit's preset |

Change the default for every recording with `RECORDING_ENCODING_DEFAULT_RESOLUTION` and `RECORDING_ENCODING_DEFAULT_PROFILE`. For example, smaller files for talking-head meetings, with 64 kbps audio and a keyframe every 4 seconds:

```dotenv
RECORDING_ENCODING_DEFAULT_RESOLUTION=720p
RECORDING_ENCODING_DEFAULT_PROFILE=talking_heads
RECORDING_ENCODING_AUDIO_BITRATE_KBPS=64
RECORDING_ENCODING_KEY_FRAME_INTERVAL_S=4.0
```

The keyframe interval sets how finely a player can seek in the file. Its default, `0.0`, leaves the choice to the encoder. To let LiveKit pick the whole encoding instead, set either default to an empty value, as [`RECORDING_ENCODING_DEFAULT_RESOLUTION`](../../reference/env-variables.md#recording) describes.

**Letting users choose.** With `RECORDING_CUSTOM_ENCODING_ENABLED=True`, room owners and co-hosts pick the profile and resolution of each recording in the settings dialog's **Recording** tab.

**Your own resolutions and profiles.** `RECORDING_ENCODING_AVAILABLE_RESOLUTIONS` and `RECORDING_ENCODING_AVAILABLE_PROFILES` replace the built-in sets. Each is a dictionary on a single line, with double-quoted keys and no outer quotes in an env file:

```dotenv
RECORDING_ENCODING_AVAILABLE_RESOLUTIONS={"540p": {"width": 960, "height": 540}, "720p": {"width": 1280, "height": 720}, "1080p": {"width": 1920, "height": 1080}}
RECORDING_ENCODING_AVAILABLE_PROFILES={"small": {"fps": 15, "kbps": {"540p": 350, "720p": 600, "1080p": 1100}}}
RECORDING_ENCODING_DEFAULT_PROFILE=small
```

Each profile must have a bitrate for exactly the available resolutions, as [`RECORDING_ENCODING_AVAILABLE_PROFILES`](../../reference/env-variables.md#recording) requires, so replacing one set usually means replacing both. The two defaults must name entries of these sets. The **Recording** tab has labels for the four built-in profiles only.

**Caveats:**

- **Screen-share readability.** At 720p, text blurs below about 40 kbit per frame, the bitrate divided by the framerate: `talking_heads` gives 47, `text` 67. For slide-heavy meetings use `text`, and lower the framerate before the bitrate.
- **Audio.** AAC at 64 kbps stereo is transparent for voice but compresses music noticeably. Keep 128 kbps if meetings include music playback.

## Testing the full recording flow

1. Start a meeting, open **More tools** → **Record**, and click **Start recording the meeting**.
2. Speak for 30 seconds, then click **Stop recording the meeting**.
3. Run the bucket check of Step 1 again, from `~/docker/garage` on Docker Compose: the object count has gone up by one.
4. Check the recording's status under `/admin/` → **Core → Recordings**.
5. Check that the email with the download link arrived.

While a recording runs, the [LiveKit CLI](https://github.com/livekit/livekit-cli) lists the active Egress jobs and their state: `lk egress list --url https://livekit.example.com --api-key meet --api-secret <your LiveKit API secret>`.
