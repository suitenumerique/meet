# Helm Deployment

LaSuite Meet provides an official Helm chart. This is the deployment method used by DINUM in production for Visio.

## Getting the chart

The chart is published to GitHub Pages:

```bash
helm repo add meet https://suitenumerique.github.io/meet/
helm repo update
```

Verify:

```bash
helm search repo meet
```

## Chart overview

The Meet Helm chart deploys the following components:

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

External services (PostgreSQL, Redis, S3, LiveKit) are configured via environment variables and must be provisioned separately.

> **Optional services have no `enabled` flag** - they are always deployed by default. Set `replicas: 0` (or `instances: []` for celeryTranscribe) to disable services you do not need.

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
    MEET_BASE_URL: "https://meet.example.com"
    ALLOW_UNREGISTERED_ROOMS: "False"

    DB_HOST: "postgresql.meet.svc.cluster.local"
    DB_PORT: "5432"
    DB_NAME: "meet"
    DB_USER: "meet"
    DB_PASSWORD: "db-password"

    REDIS_URL: "redis://redis-master:6379/0"

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

### Disable optional services (if not using recording/transcription)

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

```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

containerSecurityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

## Deploying

### Install

```bash
helm install meet meet/meet \
  --namespace meet \
  --create-namespace \
  --values values.yaml
```

### Upgrade

```bash
helm upgrade meet meet/meet \
  --namespace meet \
  --values values.yaml
```

### Check status

```bash
kubectl -n meet get pods
kubectl -n meet get ingress
kubectl -n meet logs deployment/meet-backend
```

### Run database migrations manually

The chart runs migrations automatically via a Kubernetes Job on install and upgrade. To run them manually:

```bash
kubectl -n meet exec deployment/meet-backend -- python manage.py migrate
```

### Create a superuser

```bash
kubectl -n meet exec deployment/meet-backend -- \
  python manage.py createsuperuser \
  --email admin@example.com \
  --password <password>
```

## LiveKit on Kubernetes

LiveKit is not part of the Meet Helm chart and must be deployed separately. The official LiveKit Helm chart is the simplest way:

```bash
helm repo add livekit https://helm.livekit.io
helm repo update
```

Create `livekit-values.yaml`:

```yaml
livekit:
  keys:
    myapikey: your-livekit-secret
  redis:
    address: redis-master.meet.svc.cluster.local:6379
  rtc:
    use_external_ip: true
  logging:
    level: info
  webhook:
    api_key: myapikey
    urls:
      - https://meet.example.com/api/v1.0/rooms/webhooks-livekit/

ingress:
  enabled: true
  ingressClassName: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  hosts:
    - host: livekit.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: livekit-tls
      hosts:
        - livekit.example.com
```

Deploy:

```bash
helm install livekit livekit/livekit-server \
  --namespace meet \
  --values livekit-values.yaml
```

### LiveKit media ports

LiveKit needs UDP port 7882 and TCP port 7881 accessible from the public internet. Use a **LoadBalancer** service:

```yaml
# Add to livekit-values.yaml
service:
  type: LoadBalancer
  annotations:
    # Cloud-specific annotations for UDP support
    # AWS: service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    # GCP: (network load balancer supports UDP by default)
```

Or use NodePort and open the ports on each node:

```yaml
service:
  type: NodePort
  nodePort: 7882
```

> **Do not name the LiveKit Service `livekit`.** Kubernetes injects environment variables for services by name (`LIVEKIT_PORT`, `LIVEKIT_SERVICE_HOST`), and these conflict with LiveKit's own `--port` flag. The official Helm chart uses `livekit-server` by default, which is fine.

## Recording

For the full step-by-step guide to setting up recording on Kubernetes - including MinIO deployment, bucket initialisation, LiveKit Egress, backend configuration, and `ingressMedia` - see [Recording - Kubernetes setup](../configuration/recording.md#kubernetes-setup).

## Transcription

For the full step-by-step guide to setting up AI transcription on Kubernetes - including the summary service, Celery workers, and WhisperX configuration - see [AI Transcription - Kubernetes setup](../configuration/transcription.md#kubernetes-setup).

> **Prerequisite:** the recording infrastructure (MinIO, Egress, `ingressMedia`) must be working before enabling transcription.

## Secrets management

Avoid storing secrets in `values.yaml` in version control. Use Kubernetes Secrets instead:

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

Create the Secret:

```bash
kubectl -n meet create secret generic meet-secrets \
  --from-literal=django-secret-key="$(openssl rand -hex 32)" \
  --from-literal=db-password="your-db-password" \
  --from-literal=livekit-secret="your-livekit-secret"
```

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

For managing staging and production environments:

```yaml
# helmfile.yaml
repositories:
  - name: meet
    url: https://suitenumerique.github.io/meet/

releases:
  - name: meet
    chart: meet/meet
    namespace: meet
    values:
      - values/common.yaml
      - values/{{ .Environment.Name }}.yaml

environments:
  staging:
  production:
```

Deploy:

```bash
helmfile -e production sync
helmfile -e staging diff   # preview changes before applying
```

## Known Issues

### Keycloak Health Check Port

Keycloak 26+ requires the `--health-enabled=true` flag to expose health endpoints. The health endpoint is available on port 9000 (not 8080). Configure your readiness probe accordingly:

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 9000
  initialDelaySeconds: 60
  periodSeconds: 10
```

### Helm Chart Superuser Creation

The Helm chart's automatic superuser creation job may fail with an error about missing email argument. If this occurs, create the superuser manually:

```bash
kubectl -n meet exec deployment/meet-backend -- \
  python manage.py createsuperuser \
  --email admin@example.com \
  --password <password>
```

## Upgrading

Before upgrading, check the [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for version-specific procedures.

```bash
helm repo update
helm upgrade meet meet/meet \
  --namespace meet \
  --values values.yaml
```

Database migrations run automatically via a Kubernetes Job on upgrade. Monitor:

```bash
kubectl -n meet get jobs
kubectl -n meet logs job/meet-migrate
```
