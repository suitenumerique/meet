# Helm Deployment

Working configurations for the official chart are in the repository's [`src/helm/`](https://github.com/suitenumerique/meet/tree/main/src/helm):

- [`helmfile.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/helmfile.yaml.gotmpl) - DINUM's multi-environment setup
- [`env.d/common.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/env.d/common.yaml.gotmpl) - Values shared by every environment, including the backend's environment variables and the media ingresses
- [`env.d/dev-keycloak/`](https://github.com/suitenumerique/meet/tree/main/src/helm/env.d/dev-keycloak) - Complete values files for Meet, LiveKit, and Egress
- [`meet/README.md`](https://github.com/suitenumerique/meet/blob/main/src/helm/meet/README.md) - Full parameter reference

## Getting the chart

Add the chart's repository, published on GitHub Pages, and refresh its index:

```bash
helm repo add meet https://suitenumerique.github.io/meet/
helm repo update
```

Check the chart is listed:

```bash
helm search repo meet
```

## Chart overview

| Component | Helm key | Default replicas |
|---|---|---|
| Backend (Django) | `backend` | 3 |
| Frontend (nginx) | `frontend` | 3 |
| Celery backend worker | `celeryBackend` | 1 |
| Summary service (FastAPI) | `summary` | 1 |
| Celery transcribe workers | `celeryTranscribe` | (instances list) |
| Celery summarize worker | `celerySummarize` | 1 |
| Celery summary backend | `celerySummaryBackend` | 1 |
| Agent metadata | `agentMetadata` | 1 |
| Agent subtitles | `agentSubtitles` | 1 |

The chart deploys none of the [external services](prerequisites.md#external-services), nor [LiveKit](#livekit-on-kubernetes): provision them separately, and point the backend at them through its environment variables.

## Base values.yaml

Create a `values.yaml` for your deployment. Environment variables are passed as a flat dictionary under `backend.envVars`.

### Backend

```yaml
backend:
  replicas: 2
  pdb:
    enabled: true
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      memory: 1Gi
  envVars:
    DJANGO_SETTINGS_MODULE: "meet.settings"
    DJANGO_CONFIGURATION: "Production"
    DJANGO_SECRET_KEY: "change-this-to-a-random-secret"
    DJANGO_ALLOWED_HOSTS: "meet.example.com"
    DJANGO_CSRF_TRUSTED_ORIGINS: "https://meet.example.com"
    PYTHONPATH: "/app"
    ALLOW_UNREGISTERED_ROOMS: "False"

    # Required for the chart's createsuperuser Job (backend.createsuperuser in values.yaml)
    DJANGO_SUPERUSER_EMAIL: "admin@example.com"
    DJANGO_SUPERUSER_PASSWORD: "change-this-password"

    DB_HOST: "postgresql.meet.svc.cluster.local"
    DB_PORT: "5432"
    DB_NAME: "meet"
    DB_USER: "meet"
    DB_PASSWORD: "db-password"

    REDIS_URL: "redis://redis-master:6379/0"
    # Without it, the celeryBackend worker looks for a host named "redis".
    CELERY_BROKER_URL: "redis://redis-master:6379/0"

    LIVEKIT_API_KEY: "myapikey"
    LIVEKIT_API_SECRET: "livekit-secret"
    LIVEKIT_API_URL: "https://livekit.example.com"

    OIDC_RP_CLIENT_ID: "meet"
    OIDC_RP_CLIENT_SECRET: "oidc-client-secret"
    OIDC_RP_SIGN_ALGO: "RS256"
    OIDC_RP_SCOPES: "openid email"
    OIDC_OP_AUTHORIZATION_ENDPOINT: "https://auth.example.com/realms/meet/protocol/openid-connect/auth"
    OIDC_OP_TOKEN_ENDPOINT: "https://auth.example.com/realms/meet/protocol/openid-connect/token"
    OIDC_OP_USER_ENDPOINT: "https://auth.example.com/realms/meet/protocol/openid-connect/userinfo"
    OIDC_OP_JWKS_ENDPOINT: "https://auth.example.com/realms/meet/protocol/openid-connect/certs"
    OIDC_OP_LOGOUT_ENDPOINT: "https://auth.example.com/realms/meet/protocol/openid-connect/logout"

    DJANGO_EMAIL_HOST: "smtp.example.com"
    DJANGO_EMAIL_PORT: "587"
    DJANGO_EMAIL_HOST_USER: "meet@example.com"
    DJANGO_EMAIL_HOST_PASSWORD: "smtp-password"
    DJANGO_EMAIL_USE_TLS: "True"
    DJANGO_EMAIL_FROM: "meet@example.com"
```

See [Environment Variables](../../reference/env-variables.md) for what each one does and which are required.

### Frontend

```yaml
frontend:
  replicas: 2
  pdb:
    enabled: true
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      memory: 128Mi
```

### Ingress (nginx-ingress + cert-manager)

```yaml
ingress:
  enabled: true
  className: nginx
  host: meet.example.com
  path: /
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    enabled: true
    secretName: meet-tls

ingressAdmin:
  enabled: true
  className: nginx
  host: meet.example.com
  path: /admin
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    enabled: true
    secretName: meet-tls
```

### Disable optional services

Optional services have no `enabled` flag: they deploy by default. Set `replicas: 0`, or `instances: []` for `celeryTranscribe`, to disable one.

`celeryBackend` runs the backend's background tasks, such as file deletion, only when `CELERY_ENABLED` is `"True"` in `backend.envVars`. Otherwise the backend runs them itself, and `celeryBackend` can go to 0. The others serve transcription, summaries and agents: disable those you do not use.

```yaml
celeryBackend:
  replicas: 0

summary:
  replicas: 0

celeryTranscribe:
  instances: []

celerySummarize:
  replicas: 0

celerySummaryBackend:
  replicas: 0

agentMetadata:
  replicas: 0

agentSubtitles:
  replicas: 0
```

### Security context (recommended)

Put the settings the `restricted` Pod Security Standard requires in each component's container-level `securityContext`. Every template reads `securityContext`, while `celerySummaryBackend` and the backend's cleanup CronJobs ignore `podSecurityContext`. Example for `backend`, to repeat for every component:

```yaml
backend:
  podSecurityContext:
    fsGroup: 1000
  # A read-only root filesystem needs a writable /tmp for the gunicorn workers.
  extraVolumes:
    - name: tmp
      emptyDir: {}
  extraVolumeMounts:
    - name: tmp
      mountPath: /tmp
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    seccompProfile:
      type: RuntimeDefault
    capabilities:
      drop:
        - ALL

# Repeat the securityContext block for: frontend, summary, celeryBackend,
# celeryTranscribe, celerySummarize, celerySummaryBackend, agentMetadata,
# agentSubtitles.
```

## Deploying

### Install

Install the chart with your values into a new `meet` namespace:

```bash
helm install meet meet/meet \
  --namespace meet \
  --create-namespace \
  --values values.yaml
```

### Check status

List the pods and ingresses, then read the backend's logs:

```bash
kubectl -n meet get pods
kubectl -n meet get ingress
kubectl -n meet logs deployment/meet-backend
```

### Create a superuser

Create an account that can open the admin panel at `/admin/`:

```bash
kubectl -n meet exec deployment/meet-backend -- \
  python manage.py createsuperuser \
  --email admin@example.com \
  --password <password>
```

## LiveKit on Kubernetes

LiveKit's official Helm chart is the simplest way to deploy it. Add its repository:

```bash
helm repo add livekit https://helm.livekit.io
helm repo update
```

Create `livekit-values.yaml`. LiveKit's own chart has no `ingress:` block: `loadBalancer` sets how it is exposed, here through the same nginx-ingress and cert-manager as the Meet ingress:

```yaml
livekit:
  keys:
    myapikey: your-livekit-secret
  redis:
    address: redis-master.meet.svc.cluster.local:6379
  rtc:
    use_external_ip: true
    udp_port: 7882  # Required for UDP media
  logging:
    level: info
  webhook:
    api_key: myapikey
    urls:
      - https://meet.example.com/api/v1.0/rooms/webhooks-livekit/

loadBalancer:
  type: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - hosts:
        - livekit.example.com
      secretName: livekit-tls
```

Install it into the `meet` namespace with those values:

```bash
helm install livekit-server livekit/livekit-server \
  --namespace meet \
  --values livekit-values.yaml
```

### LiveKit media ports

The chart serves LiveKit's media ports from the node itself through host networking, bypassing the Ingress and any Service. Each node that runs LiveKit needs a public IP, with the ports in [Firewall & Ports](../configuration/firewall.md) open in its security group or firewall.

## Recording and transcription

Both have a Kubernetes setup on their own page:

| Feature | Covers | Guide |
|---|---|---|
| Recording | Garage storage and its bucket, LiveKit Egress, backend configuration, `ingressMedia` | [Recording - Kubernetes setup](../configuration/recording.md#setup) |
| AI transcription | Summary service, Celery workers, WhisperX configuration. Needs recording (S3 storage, Egress, `ingressMedia`) working first | [AI Transcription - Kubernetes setup](../configuration/transcription.md#setup) |

## Rebranding the favicon

The frontend image serves the favicon as six static files from `/usr/share/nginx/html`: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`. Mount your own icons over those paths instead of forking and rebuilding the image. The right icon then shows from the first byte, with no flash, the iOS home-screen icon included. Other assets, such as the logo, are in [Theming: Custom assets](../configuration/theming.md#custom-assets-logo-images).

Put your icons in a `ConfigMap`, either written as YAML (`binaryData` keeps the PNGs intact):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: meet-favicon
binaryData:
  # base64 of each replacement icon
  favicon.ico: <base64…>
  favicon-16x16.png: <base64…>
  favicon-32x32.png: <base64…>
  apple-touch-icon.png: <base64…>
  android-chrome-192x192.png: <base64…>
  android-chrome-512x512.png: <base64…>
```

or built straight from a directory of icons:

```bash
kubectl create configmap meet-favicon --from-file=./my-icons/
```

Then mount each file over the bundled one with the chart's `frontend.extraVolumes` and `frontend.extraVolumeMounts`. `subPath` mounts the single file without hiding the rest of `html/`:

```yaml
frontend:
  extraVolumes:
    - name: favicon
      configMap:
        name: meet-favicon
  extraVolumeMounts:
    - name: favicon
      mountPath: /usr/share/nginx/html/favicon.ico
      subPath: favicon.ico
    - name: favicon
      mountPath: /usr/share/nginx/html/favicon-16x16.png
      subPath: favicon-16x16.png
    - name: favicon
      mountPath: /usr/share/nginx/html/favicon-32x32.png
      subPath: favicon-32x32.png
    - name: favicon
      mountPath: /usr/share/nginx/html/apple-touch-icon.png
      subPath: apple-touch-icon.png
    - name: favicon
      mountPath: /usr/share/nginx/html/android-chrome-192x192.png
      subPath: android-chrome-192x192.png
    - name: favicon
      mountPath: /usr/share/nginx/html/android-chrome-512x512.png
      subPath: android-chrome-512x512.png
```

## Secrets management

Keep secrets out of a `values.yaml` in version control: reference Kubernetes Secrets instead:

```yaml
backend:
  envVars:
    DJANGO_SECRET_KEY:
      secretKeyRef:
        name: meet-secrets
        key: django-secret-key
    DB_PASSWORD:
      secretKeyRef:
        name: meet-secrets
        key: db-password
    LIVEKIT_API_SECRET:
      secretKeyRef:
        name: meet-secrets
        key: livekit-secret
```

Create the Secret they reference:

```bash
kubectl -n meet create secret generic meet-secrets \
  --from-literal=django-secret-key="$(openssl rand -hex 32)" \
  --from-literal=db-password="your-db-password" \
  --from-literal=livekit-secret="your-livekit-secret"
```

### Loading a whole Secret or ConfigMap

Every component also takes `envFrom`, which turns each key of a Secret or a ConfigMap into an environment variable of the same name. Name the keys after the variables, then list the Secret:

```bash
kubectl -n meet create secret generic meet-backend-env \
  --from-literal=DJANGO_SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=DB_PASSWORD="your-db-password" \
  --from-literal=LIVEKIT_API_SECRET="your-livekit-secret"
```

```yaml
backend:
  envFrom:
    - secretRef:
        name: meet-backend-env
```

`backend.envFrom` also reaches the `celeryBackend` worker, the migration and superuser Jobs, and the CronJobs. The other components each read their own `envFrom`, and each `celeryTranscribe` instance can add `extraEnvFrom`. A variable set in `envVars` wins over the same name loaded through `envFrom`.

### SOPS (GitOps-friendly encrypted secrets)

The DINUM team uses [SOPS](https://github.com/getsops/sops) to encrypt values files for version control:

```bash
# Encrypt secrets values file
sops --encrypt values/production-secrets.yaml > values/production-secrets.enc.yaml

# Decrypt and apply
sops --decrypt values/production-secrets.enc.yaml | helm upgrade meet meet/meet \
  --namespace meet \
  --values values/production.yaml \
  --values /dev/stdin
```

## Helmfile (multi-environment)

For several environments, use [helmfile](https://helmfile.readthedocs.io/), as DINUM does for its own dev environments in [`helmfile.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/helmfile.yaml.gotmpl).

```bash
helmfile -e <environment> sync   # apply the environment's releases
helmfile -e <environment> diff   # preview changes before applying
```

## Upgrading

Before upgrading, check [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for version-specific steps. Then refresh the chart index and upgrade the release:

```bash
helm repo update
helm upgrade meet meet/meet \
  --namespace meet \
  --values values.yaml
```

The chart runs the database migrations in a Kubernetes Job on every install and upgrade. Watch it with:

```bash
kubectl -n meet get jobs
kubectl -n meet logs job/meet-backend-migrate
```

The chart deletes the Job 30 seconds after it finishes, per `backend.jobs.ttlSecondsAfterFinished`, so read its logs while it runs. To run the migrations by hand instead:

```bash
kubectl -n meet exec deployment/meet-backend -- python manage.py migrate
```
