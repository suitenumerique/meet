# Helm Deployment

Run Meet on a [Kubernetes](https://kubernetes.io/) cluster you already operate: it is how DINUM runs Visio in production. Check the [Prerequisites](prerequisites.md) first, then install Meet with [Helm](https://helm.sh/) and LiveKit beside it.

## Add the chart

```bash
helm repo add meet https://suitenumerique.github.io/meet/
helm repo update
```

## Create the secrets

Replace `<your database password>` and `<your client secret>` with your PostgreSQL password and your OIDC client's secret. The command generates the other three:

```bash
kubectl create namespace meet

kubectl -n meet create secret generic meet-backend-env \
  --from-literal=DJANGO_SECRET_KEY="$(openssl rand -hex 32)" \
  --from-literal=LIVEKIT_API_SECRET="$(openssl rand -hex 32)" \
  --from-literal=DJANGO_SUPERUSER_PASSWORD="$(openssl rand -base64 12)" \
  --from-literal=DB_PASSWORD="<your database password>" \
  --from-literal=OIDC_RP_CLIENT_SECRET="<your client secret>"
```

What each one is:

- [`DJANGO_SECRET_KEY`](../../reference/env-variables.md#DJANGO_SECRET_KEY): Django's signing key.
- [`LIVEKIT_API_SECRET`](../../reference/env-variables.md#LIVEKIT_API_SECRET): shared by Meet and LiveKit.
- `DJANGO_SUPERUSER_PASSWORD`: the first [admin account](#admin-accounts)'s.
- [`DB_PASSWORD`](../../reference/env-variables.md#DB_PASSWORD): Meet's database.
- [`OIDC_RP_CLIENT_SECRET`](../../reference/env-variables.md#OIDC_RP_CLIENT_SECRET): Meet's secret at the identity provider.

## Write values.yaml

Put the blocks below in one `values.yaml`. The chart's [README](https://github.com/suitenumerique/meet/blob/main/src/helm/meet/README.md) lists every key.

### Backend

Replace every `example.com` host, and the database and Redis hosts, with yours:

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
  # The secrets created above, one environment variable per key
  envFrom:
    - secretRef:
        name: meet-backend-env
  envVars:
    DJANGO_SETTINGS_MODULE: "meet.settings"
    DJANGO_CONFIGURATION: "Production"
    DJANGO_ALLOWED_HOSTS: "meet.example.com"
    DJANGO_CSRF_TRUSTED_ORIGINS: "https://meet.example.com"
    PYTHONPATH: "/app"
    ALLOW_UNREGISTERED_ROOMS: "False"

    # The chart's createsuperuser Job reads it, with the password from the Secret
    DJANGO_SUPERUSER_EMAIL: "admin@example.com"

    DB_HOST: "postgresql.meet.svc.cluster.local"
    DB_PORT: "5432"
    DB_NAME: "meet"
    DB_USER: "meet"

    REDIS_URL: "redis://redis-master:6379/0"
    # Without it, the celeryBackend worker looks for a host named "redis".
    CELERY_BROKER_URL: "redis://redis-master:6379/0"

    LIVEKIT_API_KEY: "meet"
    LIVEKIT_API_URL: "https://livekit.example.com"

    OIDC_RP_CLIENT_ID: "meet"
    OIDC_RP_SIGN_ALGO: "RS256"
    OIDC_RP_SCOPES: "openid email"
    OIDC_OP_AUTHORIZATION_ENDPOINT: >-
      https://auth.example.com/realms/meet/protocol/openid-connect/auth
    OIDC_OP_TOKEN_ENDPOINT: >-
      https://auth.example.com/realms/meet/protocol/openid-connect/token
    OIDC_OP_USER_ENDPOINT: >-
      https://auth.example.com/realms/meet/protocol/openid-connect/userinfo
    OIDC_OP_JWKS_ENDPOINT: >-
      https://auth.example.com/realms/meet/protocol/openid-connect/certs
    OIDC_OP_LOGOUT_ENDPOINT: >-
      https://auth.example.com/realms/meet/protocol/openid-connect/logout
```

[Environment Variables](../../reference/env-variables.md) says what each variable does. The SMTP ones go in the same block, per [Email (SMTP)](../configuration/email.md#kubernetes-setup).

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

### Ingress

Two ingresses publish Meet and its `/admin` path, with cert-manager certificates:

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

The chart also runs these by default, with no `enabled` flag. Turn off those you do not use:

```yaml
# Background tasks, run only with CELERY_ENABLED="True" in backend.envVars
celeryBackend:
  replicas: 0

# Transcription and summaries
summary:
  replicas: 0
celeryTranscribe:
  instances: []
celerySummarize:
  replicas: 0
celerySummaryBackend:
  replicas: 0

# Agents: the metadata collector and live subtitles
agentMetadata:
  replicas: 0
agentSubtitles:
  replicas: 0
```

Without [`CELERY_ENABLED`](../../reference/env-variables.md#CELERY_ENABLED), the backend deletes files and sends emails itself.

### Security context (recommended)

The chart sets no security context by default. Put the settings the `restricted` Pod Security Standard requires in each component's `securityContext`. For `backend`:

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

`celerySummaryBackend` and the backend's cleanup CronJobs ignore `podSecurityContext`.

## Install

```bash
helm install meet meet/meet -n meet -f values.yaml

# Check that the pods run and the ingresses exist
kubectl -n meet get pods
kubectl -n meet get ingress
```

If a pod fails, read its logs, for example `kubectl -n meet logs deployment/meet-backend`.

### Admin accounts

The chart's `createsuperuser` Job creates one from `DJANGO_SUPERUSER_EMAIL` and the password in the Secret, which this prints:

```bash
kubectl -n meet get secret meet-backend-env \
  -o jsonpath='{.data.DJANGO_SUPERUSER_PASSWORD}' | base64 -d
```

To add another account that can open `/admin/`, put its email and a strong password in place of the two example values:

```bash
kubectl -n meet exec deployment/meet-backend -- python manage.py createsuperuser \
  --email admin@example.com --password '<a strong password>'
```

## LiveKit on Kubernetes

LiveKit, the media server carrying the calls' audio and video, has its own Helm chart:

```bash
helm repo add livekit https://helm.livekit.io
helm repo update
```

Its `keys:` take the `LIVEKIT_API_SECRET` from Meet's Secret, which this prints. Put it in place of `<LIVEKIT_API_SECRET>`, and your hosts in place of the `example.com` ones:

```bash
kubectl -n meet get secret meet-backend-env \
  -o jsonpath='{.data.LIVEKIT_API_SECRET}' | base64 -d
```

```yaml
# livekit-values.yaml
livekit:
  keys:
    meet: <LIVEKIT_API_SECRET>
  redis:
    address: redis-master.meet.svc.cluster.local:6379
  rtc:
    use_external_ip: true
    # Required for UDP media
    udp_port: 7882
  logging:
    level: info
  webhook:
    api_key: meet
    urls:
      - https://meet.example.com/api/v1.0/rooms/webhooks-livekit/

# The chart has no ingress: block. This exposes LiveKit through the same
# nginx-ingress and cert-manager as Meet.
loadBalancer:
  type: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - hosts:
        - livekit.example.com
      secretName: livekit-tls
```

```bash
helm install livekit-server livekit/livekit-server -n meet -f livekit-values.yaml
```

Other `loadBalancer` types, for a cloud load balancer, are in LiveKit's [`server-sample.yaml`](https://github.com/livekit/livekit-helm/blob/master/server-sample.yaml).

### LiveKit media ports

Each node that runs LiveKit needs a public IP, with the ports in [Firewall & Ports](../configuration/firewall.md) open in its security group or firewall.

## Recording and transcription

Both are optional. Set up [Recording](../configuration/recording.md#setup), then [AI Transcription](../configuration/transcription.md#setup) once recording works.

## Secrets management

`backend.envFrom` loads the Secret into the backend, the `celeryBackend` worker, the migration and superuser Jobs, and the CronJobs.

- The other components each read their own `envFrom`, and each `celeryTranscribe` instance can add `extraEnvFrom`.
- A variable set in `envVars` wins over the same name loaded through `envFrom`.

To take a single variable from a Secret of another shape, reference it under `envVars`:

```yaml
backend:
  envVars:
    DB_PASSWORD:
      secretKeyRef:
        name: my-database
        key: password
```

### Encrypted values files with SOPS

DINUM encrypts its values files with [SOPS](https://github.com/getsops/sops) to keep them in version control:

```bash
# Encrypt the secrets values file
sops --encrypt values/production-secrets.yaml > values/production-secrets.enc.yaml

# Decrypt it and apply
sops --decrypt values/production-secrets.enc.yaml | helm upgrade meet meet/meet \
  -n meet -f values/production.yaml -f /dev/stdin
```

## Several environments with helmfile

Use [helmfile](https://helmfile.readthedocs.io/), as DINUM does:

```bash
# Preview the changes
helmfile -e <environment> diff

# Apply the environment's releases
helmfile -e <environment> sync
```

DINUM's setup in [`src/helm/`](https://github.com/suitenumerique/meet/tree/main/src/helm) is a working example:

- [`helmfile.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/helmfile.yaml.gotmpl): the environments.
- [`env.d/common.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/env.d/common.yaml.gotmpl): the values every environment shares.
- [`env.d/dev-keycloak/`](https://github.com/suitenumerique/meet/tree/main/src/helm/env.d/dev-keycloak): complete values for Meet, LiveKit and Egress.

## Upgrading

Check [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for version-specific steps first:

```bash
helm repo update
helm upgrade meet meet/meet -n meet -f values.yaml
```

The chart runs the database migrations in a Job, `meet-backend-migrate`. Kubernetes deletes it 30 seconds after it finishes, per `backend.jobs.ttlSecondsAfterFinished`, so read its logs while it runs:

```bash
kubectl -n meet logs job/meet-backend-migrate
```

To run the migrations by hand instead:

```bash
kubectl -n meet exec deployment/meet-backend -- python manage.py migrate
```

## Next

Continue with [Next steps](../index.md#next-steps).
