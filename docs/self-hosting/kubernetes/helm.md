# Helm Deployment

Run Meet on a [Kubernetes](https://kubernetes.io/) cluster you already operate: it is how [DINUM](https://www.numerique.gouv.fr/) runs [Visio](https://visio.numerique.gouv.fr/) in production. Check the [Prerequisites](prerequisites.md) first, then install Meet with [Helm](https://helm.sh/) and LiveKit beside it. [What runs where](../../overview/how-meet-works.md#the-pieces) lists the parts this deploys.

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
- [`DJANGO_SUPERUSER_PASSWORD`](../../reference/env-variables.md#DJANGO_SUPERUSER_PASSWORD): the password of the first [admin account](#admin-accounts).
- [`DB_PASSWORD`](../../reference/env-variables.md#DB_PASSWORD): Meet's database.
- [`OIDC_RP_CLIENT_SECRET`](../../reference/env-variables.md#OIDC_RP_CLIENT_SECRET): Meet's secret at the identity provider.

## Download the values

Meet's values and LiveKit's come as two files, [`values.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/kubernetes/values.yaml) and [`livekit-values.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/kubernetes/livekit-values.yaml):

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

curl -fsSL --remote-name-all \
  $RAW/docs/examples/kubernetes/{values.yaml,livekit-values.yaml}
```

Replace `your-domain.org` with your domain. Meet, LiveKit and Keycloak then answer on its `meet.`, `livekit.` and `auth.` subdomains, the [three domain names](prerequisites.md#three-domain-names):

```bash
DOMAIN=your-domain.org
sed -i "s/example\.com/$DOMAIN/g" values.yaml livekit-values.yaml
```

Then check, in `values.yaml`:

- [`DB_HOST`](../../reference/env-variables.md#DB_HOST) and the other `DB_` lines: your PostgreSQL.
- [`REDIS_URL`](../../reference/env-variables.md#REDIS_URL) and [`CELERY_BROKER_URL`](../../reference/env-variables.md#CELERY_BROKER_URL): your Redis.
- The `OIDC_OP_` endpoints, such as [`OIDC_OP_AUTHORIZATION_ENDPOINT`](../../reference/env-variables.md#OIDC_OP_AUTHORIZATION_ENDPOINT): Keycloak's form, while another provider's are in [SSO & Authentication](../configuration/sso.md).

The file also holds every optional feature switched off, commented out or behind `enabled: false`, each comment naming the guide that turns it on. The chart's [README](https://github.com/suitenumerique/meet/blob/main/src/helm/meet/README.md) lists every key.

And in `livekit-values.yaml`:

- `livekit.redis.address`: your Redis, the one Meet uses.

### Security context (recommended)

The chart sets no security context by default. `values.yaml` holds the settings the `restricted` Pod Security Standard requires, commented out:

1. Under `backend`, uncomment the block from `podSecurityContext` to `extraVolumeMounts`. Its `securityContext` defines the `restrictedContext` anchor.
2. After step 1, uncomment `securityContext: *restrictedContext` under each other component: `frontend`, `summary`, `celeryBackend`, `celeryTranscribe`, `celerySummarize`, `celerySummaryBackend`, `agentMetadata` and `agentSubtitles`. Without step 1's anchor, Helm refuses the file.
3. Under `frontend`, also uncomment the `extraVolumes:` and `extraVolumeMounts:` keys and their `tmp` entries: nginx cannot start on a read-only root filesystem without a writable `/tmp`.

`celerySummaryBackend` and the backend's cleanup CronJobs ignore `podSecurityContext`.

## Install

`--version` pins the chart, so a reinstall gets the same one; `helm search repo meet/meet --versions` lists them. `--wait` returns once every pod is ready, and the command is safe to run again:

```bash
helm upgrade --install meet meet/meet -n meet -f values.yaml \
  --version 0.0.29 --wait --timeout 10m

# Check that the pods run, the ingresses exist and the certificates are issued
kubectl -n meet get pods
kubectl -n meet get ingress
kubectl -n meet get certificate

# If a pod fails, read its logs
kubectl -n meet logs deployment/meet-backend
```

### Admin accounts

The chart's `createsuperuser` Job creates the first admin account from [`DJANGO_SUPERUSER_EMAIL`](../../reference/env-variables.md#DJANGO_SUPERUSER_EMAIL) and the password in the Secret, which this prints:

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

Its `livekit.keys` take the [`LIVEKIT_API_SECRET`](../../reference/env-variables.md#LIVEKIT_API_SECRET) of Meet's Secret. Put it in `livekit-values.yaml`:

```bash
JP='{.data.LIVEKIT_API_SECRET}'
SECRET=$(kubectl -n meet get secret meet-backend-env -o jsonpath="$JP" | base64 -d)
sed -i "s|<LIVEKIT_API_SECRET>|$SECRET|" livekit-values.yaml
```

Then install it:

```bash
helm upgrade --install livekit-server livekit/livekit-server -n meet \
  -f livekit-values.yaml --version 1.9.0 --wait --timeout 10m
```

`livekit-values.yaml` exposes LiveKit through a plain Ingress, which the cluster's default IngressClass serves. Other `loadBalancer` types, for a cloud load balancer, are in LiveKit's [`server-sample.yaml`](https://github.com/livekit/livekit-helm/blob/master/server-sample.yaml).

### LiveKit media ports

Each node that runs LiveKit needs a public IP, with the ports in [Firewall & Ports](../configuration/firewall.md) open in its security group or firewall. LiveKit's pods use the node's network, so a node runs one of them at most.

### Check the install

Open `https://meet.your-domain.org`, sign in, and join the same room from two devices. Audio and video both ways means sign-in, LiveKit and its media ports all work.

## Recording and transcription

Both are optional. Set up [Recording](../configuration/recording.md#setup), then [AI Transcription](../configuration/transcription.md#setup) once recording works.

## Secrets management

`backend.envFrom` loads a Secret or a ConfigMap, one variable per key, into the backend, the `celeryBackend` worker, the migration and superuser Jobs, and the CronJobs.

- The other components each read their own `envFrom`, and each `celeryTranscribe` instance can add `extraEnvFrom`.
- A variable set in `envVars` wins over the same name loaded through `envFrom`.

To take a single variable from a Secret of another shape, reference it under `envVars`, as the commented `DB_PASSWORD` of `values.yaml` does: uncomment it, then put that Secret's name and key in place of `my-database` and `password`.

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

Use [helmfile](https://helmfile.readthedocs.io/), as DINUM does for its dev environments. Replace `<environment>` with one your `helmfile.yaml.gotmpl` defines:

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

Check [UPGRADE.md](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md) for version-specific steps first, and back up Meet's database, with your PostgreSQL provider's backup or `pg_dump`: `helm rollback` does not undo a migration. Replace `<new version>` with one `helm search repo meet/meet --versions` lists:

```bash
helm repo update
helm upgrade meet meet/meet -n meet -f values.yaml \
  --version <new version> --wait --timeout 10m
```

If `values.yaml` is lost, `helm get values meet -n meet > values.yaml` exports the values in use.

The chart runs the database migrations in a Job, `meet-backend-migrate`. Kubernetes deletes it 30 seconds after it finishes, per `backend.jobs.ttlSecondsAfterFinished`, so read its logs while it runs:

```bash
kubectl -n meet logs job/meet-backend-migrate
```

To run the migrations by hand instead:

```bash
kubectl -n meet exec deployment/meet-backend -- python manage.py migrate
```

LiveKit upgrades through its own release, its versions listed by `helm search repo livekit/livekit-server --versions`:

```bash
helm upgrade livekit-server livekit/livekit-server -n meet \
  -f livekit-values.yaml --version <new version>
```

An old LiveKit pod keeps serving its calls until they end, for up to 5 hours, the chart's `terminationGracePeriodSeconds: 18000`, so the rollout can take that long.

## Uninstall

```bash
helm uninstall meet livekit-server -n meet
kubectl -n meet delete secret meet-backend-env
```

Your PostgreSQL, Redis, S3 bucket and identity provider stay as they are. `kubectl delete namespace meet` removes everything left in the namespace, a PostgreSQL installed there included.
