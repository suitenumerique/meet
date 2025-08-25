# Meet helm chart

## Parameters

### General configuration

| Name                                                                         | Description                                          | Value                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `image.repository`                                                           | Repository to use to pull meet's container image     | `lasuite/meet-backend`                                             |
| `image.tag`                                                                  | meet's container tag                                 | `latest`                                                           |
| `image.pullPolicy`                                                           | Container image pull policy                          | `IfNotPresent`                                                     |
| `image.credentials.username`                                                 | Username for container registry authentication       |                                                                    |
| `image.credentials.password`                                                 | Password for container registry authentication       |                                                                    |
| `image.credentials.registry`                                                 | Registry url for which the credentials are specified |                                                                    |
| `image.credentials.name`                                                     | Name of the generated secret for imagePullSecrets    |                                                                    |
| `nameOverride`                                                               | Override the chart name                              | `""`                                                               |
| `fullnameOverride`                                                           | Override the full application name                   | `""`                                                               |
| `ingress.enabled`                                                            | whether to enable the Ingress or not                 | `false`                                                            |
| `ingress.className`                                                          | IngressClass to use for the Ingress                  | `nil`                                                              |
| `ingress.host`                                                               | Host for the Ingress                                 | `meet.example.com`                                                 |
| `ingress.path`                                                               | Path to use for the Ingress                          | `/`                                                                |
| `ingress.hosts`                                                              | Additional host to configure for the Ingress         | `[]`                                                               |
| `ingress.tls.enabled`                                                        | Weather to enable TLS for the Ingress                | `true`                                                             |
| `ingress.tls.secretName`                                                     | Secret name for TLS config                           | `nil`                                                              |
| `ingress.tls.additional[].secretName`                                        | Secret name for additional TLS config                |                                                                    |
| `ingress.tls.additional[].hosts[]`                                           | Hosts for additional TLS config                      |                                                                    |
| `ingress.customBackends`                                                     | Add custom backends to ingress                       | `[]`                                                               |
| `ingressAdmin.enabled`                                                       | whether to enable the Ingress or not                 | `false`                                                            |
| `ingressAdmin.className`                                                     | IngressClass to use for the Ingress                  | `nil`                                                              |
| `ingressAdmin.host`                                                          | Host for the Ingress                                 | `meet.example.com`                                                 |
| `ingressAdmin.path`                                                          | Path to use for the Ingress                          | `/admin`                                                           |
| `ingressAdmin.hosts`                                                         | Additional host to configure for the Ingress         | `[]`                                                               |
| `ingressAdmin.tls.enabled`                                                   | Weather to enable TLS for the Ingress                | `true`                                                             |
| `ingressAdmin.tls.secretName`                                                | Secret name for TLS config                           | `nil`                                                              |
| `ingressAdmin.tls.additional[].secretName`                                   | Secret name for additional TLS config                |                                                                    |
| `ingressAdmin.tls.additional[].hosts[]`                                      | Hosts for additional TLS config                      |                                                                    |
| `ingressMedia.enabled`                                                       | whether to enable the Ingress or not                 | `false`                                                            |
| `ingressMedia.className`                                                     | IngressClass to use for the Ingress                  | `nil`                                                              |
| `ingressMedia.host`                                                          | Host for the Ingress                                 | `meet.example.com`                                                 |
| `ingressMedia.path`                                                          | Path to use for the Ingress                          | `/media/(.*)`                                                      |
| `ingressMedia.hosts`                                                         | Additional host to configure for the Ingress         | `[]`                                                               |
| `ingressMedia.tls.enabled`                                                   | Weather to enable TLS for the Ingress                | `true`                                                             |
| `ingressMedia.tls.secretName`                                                | Secret name for TLS config                           | `nil`                                                              |
| `ingressMedia.tls.additional[].secretName`                                   | Secret name for additional TLS config                |                                                                    |
| `ingressMedia.tls.additional[].hosts[]`                                      | Hosts for additional TLS config                      |                                                                    |
| `ingressMedia.annotations.nginx.ingress.kubernetes.io/auth-url`              |                                                      | `https://meet.example.com/api/v1.0/recordings/media-auth/`         |
| `ingressMedia.annotations.nginx.ingress.kubernetes.io/auth-response-headers` |                                                      | `Authorization, X-Amz-Date, X-Amz-Content-SHA256`                  |
| `ingressMedia.annotations.nginx.ingress.kubernetes.io/upstream-vhost`        |                                                      | `minio.meet.svc.cluster.local:9000`                                |
| `ingressMedia.annotations.nginx.ingress.kubernetes.io/configuration-snippet` |                                                      | `add_header Content-Security-Policy "default-src 'none'" always;
` |
| `serviceMedia.host`                                                          |                                                      | `minio.meet.svc.cluster.local`                                     |
| `serviceMedia.port`                                                          |                                                      | `9000`                                                             |
| `serviceMedia.annotations`                                                   |                                                      | `{}`                                                               |

### backend

| Name                                                  | Description                                                                        | Value                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend.dpAnnotations`                               | Annotations to add to the backend Deployment                                       | `{}`                                                                                                                                                                                                                                                                                |
| `backend.command`                                     | Override the backend container command                                             | `[]`                                                                                                                                                                                                                                                                                |
| `backend.args`                                        | Override the backend container args                                                | `[]`                                                                                                                                                                                                                                                                                |
| `backend.replicas`                                    | Amount of backend replicas                                                         | `3`                                                                                                                                                                                                                                                                                 |
| `backend.shareProcessNamespace`                       | Enable share process namespace between containers                                  | `false`                                                                                                                                                                                                                                                                             |
| `backend.sidecars`                                    | Add sidecars containers to backend deployment                                      | `[]`                                                                                                                                                                                                                                                                                |
| `backend.migrateJobAnnotations`                       | Annotations for the migrate job                                                    | `{}`                                                                                                                                                                                                                                                                                |
| `backend.jobs.ttlSecondsAfterFinished`                | Period to wait before remove jobs                                                  | `30`                                                                                                                                                                                                                                                                                |
| `backend.jobs.backoffLimit`                           | Numbers of jobs retries                                                            | `2`                                                                                                                                                                                                                                                                                 |
| `backend.securityContext`                             | Configure backend Pod security context                                             | `nil`                                                                                                                                                                                                                                                                               |
| `backend.envVars`                                     | Configure backend container environment variables                                  | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.envVars.BY_VALUE`                            | Example environment variable by setting value directly                             |                                                                                                                                                                                                                                                                                     |
| `backend.envVars.FROM_CONFIGMAP.configMapKeyRef.name` | Name of a ConfigMap when configuring env vars from a ConfigMap                     |                                                                                                                                                                                                                                                                                     |
| `backend.envVars.FROM_CONFIGMAP.configMapKeyRef.key`  | Key within a ConfigMap when configuring env vars from a ConfigMap                  |                                                                                                                                                                                                                                                                                     |
| `backend.envVars.FROM_SECRET.secretKeyRef.name`       | Name of a Secret when configuring env vars from a Secret                           |                                                                                                                                                                                                                                                                                     |
| `backend.envVars.FROM_SECRET.secretKeyRef.key`        | Key within a Secret when configuring env vars from a Secret                        |                                                                                                                                                                                                                                                                                     |
| `backend.podAnnotations`                              | Annotations to add to the backend Pod                                              | `{}`                                                                                                                                                                                                                                                                                |
| `backend.service.type`                                | backend Service type                                                               | `ClusterIP`                                                                                                                                                                                                                                                                         |
| `backend.service.port`                                | backend Service listening port                                                     | `80`                                                                                                                                                                                                                                                                                |
| `backend.service.targetPort`                          | backend container listening port                                                   | `8000`                                                                                                                                                                                                                                                                              |
| `backend.service.annotations`                         | Annotations to add to the backend Service                                          | `{}`                                                                                                                                                                                                                                                                                |
| `backend.migrate.command`                             | backend migrate command                                                            | `["/bin/sh","-c","while ! python manage.py check --database default > /dev/null 2>&1\ndo\n  echo \"Database not ready\"\n  sleep 2\ndone\necho \"Database is ready\"\n\npython manage.py migrate --no-input\n"]`                                                                    |
| `backend.migrate.restartPolicy`                       | backend migrate job restart policy                                                 | `Never`                                                                                                                                                                                                                                                                             |
| `backend.createsuperuser.command`                     | backend migrate command                                                            | `["/bin/sh","-c","while ! python manage.py check --database default > /dev/null 2>&1\ndo\n  echo \"Database not ready\"\n  sleep 2\ndone\necho \"Database is ready\"\n\npython manage.py createsuperuser --email $DJANGO_SUPERUSER_EMAIL --password $DJANGO_SUPERUSER_PASSWORD\n"]` |
| `backend.createsuperuser.restartPolicy`               | backend migrate job restart policy                                                 | `Never`                                                                                                                                                                                                                                                                             |
| `backend.probes.liveness.path`                        | Configure path for backend HTTP liveness probe                                     | `/__heartbeat__`                                                                                                                                                                                                                                                                    |
| `backend.probes.liveness.targetPort`                  | Configure port for backend HTTP liveness probe                                     | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.liveness.initialDelaySeconds`         | Configure initial delay for backend liveness probe                                 | `30`                                                                                                                                                                                                                                                                                |
| `backend.probes.liveness.initialDelaySeconds`         | Configure timeout for backend liveness probe                                       | `30`                                                                                                                                                                                                                                                                                |
| `backend.probes.startup.path`                         | Configure path for backend HTTP startup probe                                      | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.startup.targetPort`                   | Configure port for backend HTTP startup probe                                      | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.startup.initialDelaySeconds`          | Configure initial delay for backend startup probe                                  | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.startup.initialDelaySeconds`          | Configure timeout for backend startup probe                                        | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.readiness.path`                       | Configure path for backend HTTP readiness probe                                    | `/__lbheartbeat__`                                                                                                                                                                                                                                                                  |
| `backend.probes.readiness.targetPort`                 | Configure port for backend HTTP readiness probe                                    | `undefined`                                                                                                                                                                                                                                                                         |
| `backend.probes.readiness.initialDelaySeconds`        | Configure initial delay for backend readiness probe                                | `30`                                                                                                                                                                                                                                                                                |
| `backend.probes.readiness.initialDelaySeconds`        | Configure timeout for backend readiness probe                                      | `30`                                                                                                                                                                                                                                                                                |
| `backend.resources`                                   | Resource requirements for the backend container                                    | `{}`                                                                                                                                                                                                                                                                                |
| `backend.nodeSelector`                                | Node selector for the backend Pod                                                  | `{}`                                                                                                                                                                                                                                                                                |
| `backend.tolerations`                                 | Tolerations for the backend Pod                                                    | `[]`                                                                                                                                                                                                                                                                                |
| `backend.affinity`                                    | Affinity for the backend Pod                                                       | `{}`                                                                                                                                                                                                                                                                                |
| `backend.persistence`                                 | Additional volumes to create and mount on the backend. Used for debugging purposes | `{}`                                                                                                                                                                                                                                                                                |
| `backend.persistence.volume-name.size`                | Size of the additional volume                                                      |                                                                                                                                                                                                                                                                                     |
| `backend.persistence.volume-name.type`                | Type of the additional volume, persistentVolumeClaim or emptyDir                   |                                                                                                                                                                                                                                                                                     |
| `backend.persistence.volume-name.mountPath`           | Path where the volume should be mounted to                                         |                                                                                                                                                                                                                                                                                     |
| `backend.extraVolumeMounts`                           | Additional volumes to mount on the backend.                                        | `[]`                                                                                                                                                                                                                                                                                |
| `backend.extraVolumes`                                | Additional volumes to mount on the backend.                                        | `[]`                                                                                                                                                                                                                                                                                |
| `backend.pdb.enabled`                                 | Enable pdb on backend                                                              | `true`                                                                                                                                                                                                                                                                              |

### frontend

| Name                                                   | Description                                                                         | Value                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------- |
| `frontend.image.repository`                            | Repository to use to pull meet's frontend container image                           | `lasuite/meet-frontend` |
| `frontend.image.tag`                                   | meet's frontend container tag                                                       | `latest`                |
| `frontend.image.pullPolicy`                            | frontend container image pull policy                                                | `IfNotPresent`          |
| `frontend.dpAnnotations`                               | Annotations to add to the frontend Deployment                                       | `{}`                    |
| `frontend.command`                                     | Override the frontend container command                                             | `[]`                    |
| `frontend.args`                                        | Override the frontend container args                                                | `[]`                    |
| `frontend.replicas`                                    | Amount of frontend replicas                                                         | `3`                     |
| `frontend.shareProcessNamespace`                       | Enable share process namefrontend between containers                                | `false`                 |
| `frontend.sidecars`                                    | Add sidecars containers to frontend deployment                                      | `[]`                    |
| `frontend.securityContext`                             | Configure frontend Pod security context                                             | `nil`                   |
| `frontend.envVars`                                     | Configure frontend container environment variables                                  | `undefined`             |
| `frontend.envVars.BY_VALUE`                            | Example environment variable by setting value directly                              |                         |
| `frontend.envVars.FROM_CONFIGMAP.configMapKeyRef.name` | Name of a ConfigMap when configuring env vars from a ConfigMap                      |                         |
| `frontend.envVars.FROM_CONFIGMAP.configMapKeyRef.key`  | Key within a ConfigMap when configuring env vars from a ConfigMap                   |                         |
| `frontend.envVars.FROM_SECRET.secretKeyRef.name`       | Name of a Secret when configuring env vars from a Secret                            |                         |
| `frontend.envVars.FROM_SECRET.secretKeyRef.key`        | Key within a Secret when configuring env vars from a Secret                         |                         |
| `frontend.podAnnotations`                              | Annotations to add to the frontend Pod                                              | `{}`                    |
| `frontend.service.type`                                | frontend Service type                                                               | `ClusterIP`             |
| `frontend.service.port`                                | frontend Service listening port                                                     | `80`                    |
| `frontend.service.targetPort`                          | frontend container listening port                                                   | `8080`                  |
| `frontend.service.annotations`                         | Annotations to add to the frontend Service                                          | `{}`                    |
| `frontend.probes`                                      | Configure probe for frontend                                                        | `{}`                    |
| `frontend.probes.liveness.path`                        | Configure path for frontend HTTP liveness probe                                     |                         |
| `frontend.probes.liveness.targetPort`                  | Configure port for frontend HTTP liveness probe                                     |                         |
| `frontend.probes.liveness.initialDelaySeconds`         | Configure initial delay for frontend liveness probe                                 |                         |
| `frontend.probes.liveness.initialDelaySeconds`         | Configure timeout for frontend liveness probe                                       |                         |
| `frontend.probes.startup.path`                         | Configure path for frontend HTTP startup probe                                      |                         |
| `frontend.probes.startup.targetPort`                   | Configure port for frontend HTTP startup probe                                      |                         |
| `frontend.probes.startup.initialDelaySeconds`          | Configure initial delay for frontend startup probe                                  |                         |
| `frontend.probes.startup.initialDelaySeconds`          | Configure timeout for frontend startup probe                                        |                         |
| `frontend.probes.readiness.path`                       | Configure path for frontend HTTP readiness probe                                    |                         |
| `frontend.probes.readiness.targetPort`                 | Configure port for frontend HTTP readiness probe                                    |                         |
| `frontend.probes.readiness.initialDelaySeconds`        | Configure initial delay for frontend readiness probe                                |                         |
| `frontend.probes.readiness.initialDelaySeconds`        | Configure timeout for frontend readiness probe                                      |                         |
| `frontend.resources`                                   | Resource requirements for the frontend container                                    | `{}`                    |
| `frontend.nodeSelector`                                | Node selector for the frontend Pod                                                  | `{}`                    |
| `frontend.tolerations`                                 | Tolerations for the frontend Pod                                                    | `[]`                    |
| `frontend.affinity`                                    | Affinity for the frontend Pod                                                       | `{}`                    |
| `frontend.persistence`                                 | Additional volumes to create and mount on the frontend. Used for debugging purposes | `{}`                    |
| `frontend.persistence.volume-name.size`                | Size of the additional volume                                                       |                         |
| `frontend.persistence.volume-name.type`                | Type of the additional volume, persistentVolumeClaim or emptyDir                    |                         |
| `frontend.persistence.volume-name.mountPath`           | Path where the volume should be mounted to                                          |                         |
| `frontend.extraVolumeMounts`                           | Additional volumes to mount on the frontend.                                        | `[]`                    |
| `frontend.extraVolumes`                                | Additional volumes to mount on the frontend.                                        | `[]`                    |
| `frontend.pdb.enabled`                                 | Enable pdb on frontend                                                              | `true`                  |

### posthog

| Name                                   | Description                                                 | Value                     |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| `posthog.ingress.enabled`              | Enable or disable the ingress resource creation             | `false`                   |
| `posthog.ingress.className`            | Kubernetes ingress class name to use (e.g., nginx, traefik) | `nil`                     |
| `posthog.ingress.host`                 | Primary hostname for the ingress resource                   | `meet.example.com`        |
| `posthog.ingress.path`                 | URL path prefix for the ingress routes (e.g., /)            | `/`                       |
| `posthog.ingress.hosts`                | Additional hostnames array to be included in the ingress    | `[]`                      |
| `posthog.ingress.tls.enabled`          | Enable or disable TLS/HTTPS for the ingress                 | `true`                    |
| `posthog.ingress.tls.secretName`       | Secret name for TLS config                                  | `nil`                     |
| `posthog.ingress.tls.additional`       | Additional TLS configurations for extra hosts/certificates  | `[]`                      |
| `posthog.ingress.customBackends`       | Custom backend service configurations for the ingress       | `[]`                      |
| `posthog.ingress.annotations`          | Additional Kubernetes annotations to apply to the ingress   | `{}`                      |
| `posthog.ingressAssets.enabled`        | Enable or disable the ingress resource creation             | `false`                   |
| `posthog.ingressAssets.className`      | Kubernetes ingress class name to use (e.g., nginx, traefik) | `nil`                     |
| `posthog.ingressAssets.host`           | Primary hostname for the ingress resource                   | `meet.example.com`        |
| `posthog.ingressAssets.path`           | URL path prefix for the ingress routes (e.g., /)            | `/static`                 |
| `posthog.ingressAssets.hosts`          | Additional hostnames array to be included in the ingress    | `[]`                      |
| `posthog.ingressAssets.tls.enabled`    | Enable or disable TLS/HTTPS for the ingress                 | `true`                    |
| `posthog.ingressAssets.tls.secretName` | Secret name for TLS config                                  | `nil`                     |
| `posthog.ingressAssets.tls.additional` | Additional TLS configurations for extra hosts/certificates  | `[]`                      |
| `posthog.ingressAssets.customBackends` | Custom backend service configurations for the ingress       | `[]`                      |
| `posthog.ingressAssets.annotations`    | Additional Kubernetes annotations to apply to the ingress   | `{}`                      |
| `posthog.service.type`                 | Service type (e.g. ExternalName, ClusterIP, LoadBalancer)   | `ExternalName`            |
| `posthog.service.externalName`         | External service hostname when type is ExternalName         | `eu.i.posthog.com`        |
| `posthog.service.port`                 | Port number for the service                                 | `443`                     |
| `posthog.service.annotations`          | Additional annotations to apply to the service              | `{}`                      |
| `posthog.assetsService.type`           | Service type (e.g. ExternalName, ClusterIP, LoadBalancer)   | `ExternalName`            |
| `posthog.assetsService.externalName`   | External service hostname when type is ExternalName         | `eu-assets.i.posthog.com` |
| `posthog.assetsService.port`           | Port number for the service                                 | `443`                     |
| `posthog.assetsService.annotations`    | Additional annotations to apply to the service              | `{}`                      |

### summary

| Name                                                  | Description                                                                        | Value              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| `summary.dpAnnotations`                               | Annotations to add to the summary Deployment                                       | `{}`               |
| `summary.command`                                     | Override the summary container command                                             | `[]`               |
| `summary.args`                                        | Override the summary container args                                                | `[]`               |
| `summary.replicas`                                    | Amount of summary replicas                                                         | `1`                |
| `summary.shareProcessNamespace`                       | Enable share process namespace between containers                                  | `false`            |
| `summary.sidecars`                                    | Add sidecars containers to summary deployment                                      | `[]`               |
| `summary.migrateJobAnnotations`                       | Annotations for the migrate job                                                    | `{}`               |
| `summary.securityContext`                             | Configure summary Pod security context                                             | `nil`              |
| `summary.envVars`                                     | Configure summary container environment variables                                  | `undefined`        |
| `summary.envVars.BY_VALUE`                            | Example environment variable by setting value directly                             |                    |
| `summary.envVars.FROM_CONFIGMAP.configMapKeyRef.name` | Name of a ConfigMap when configuring env vars from a ConfigMap                     |                    |
| `summary.envVars.FROM_CONFIGMAP.configMapKeyRef.key`  | Key within a ConfigMap when configuring env vars from a ConfigMap                  |                    |
| `summary.envVars.FROM_SECRET.secretKeyRef.name`       | Name of a Secret when configuring env vars from a Secret                           |                    |
| `summary.envVars.FROM_SECRET.secretKeyRef.key`        | Key within a Secret when configuring env vars from a Secret                        |                    |
| `summary.podAnnotations`                              | Annotations to add to the summary Pod                                              | `{}`               |
| `summary.service.type`                                | summary Service type                                                               | `ClusterIP`        |
| `summary.service.port`                                | summary Service listening port                                                     | `80`               |
| `summary.service.targetPort`                          | summary container listening port                                                   | `8000`             |
| `summary.service.annotations`                         | Annotations to add to the summary Service                                          | `{}`               |
| `summary.probes.liveness.path`                        | Configure path for summary HTTP liveness probe                                     | `/__heartbeat__`   |
| `summary.probes.liveness.targetPort`                  | Configure port for summary HTTP liveness probe                                     | `undefined`        |
| `summary.probes.liveness.initialDelaySeconds`         | Configure initial delay for summary liveness probe                                 | `30`               |
| `summary.probes.liveness.initialDelaySeconds`         | Configure timeout for summary liveness probe                                       | `30`               |
| `summary.probes.startup.path`                         | Configure path for summary HTTP startup probe                                      | `undefined`        |
| `summary.probes.startup.targetPort`                   | Configure port for summary HTTP startup probe                                      | `undefined`        |
| `summary.probes.startup.initialDelaySeconds`          | Configure initial delay for summary startup probe                                  | `undefined`        |
| `summary.probes.startup.initialDelaySeconds`          | Configure timeout for summary startup probe                                        | `undefined`        |
| `summary.probes.readiness.path`                       | Configure path for summary HTTP readiness probe                                    | `/__lbheartbeat__` |
| `summary.probes.readiness.targetPort`                 | Configure port for summary HTTP readiness probe                                    | `undefined`        |
| `summary.probes.readiness.initialDelaySeconds`        | Configure initial delay for summary readiness probe                                | `30`               |
| `summary.probes.readiness.initialDelaySeconds`        | Configure timeout for summary readiness probe                                      | `30`               |
| `summary.resources`                                   | Resource requirements for the summary container                                    | `{}`               |
| `summary.nodeSelector`                                | Node selector for the summary Pod                                                  | `{}`               |
| `summary.tolerations`                                 | Tolerations for the summary Pod                                                    | `[]`               |
| `summary.affinity`                                    | Affinity for the summary Pod                                                       | `{}`               |
| `summary.persistence`                                 | Additional volumes to create and mount on the summary. Used for debugging purposes | `{}`               |
| `summary.persistence.volume-name.size`                | Size of the additional volume                                                      |                    |
| `summary.persistence.volume-name.type`                | Type of the additional volume, persistentVolumeClaim or emptyDir                   |                    |
| `summary.persistence.volume-name.mountPath`           | Path where the volume should be mounted to                                         |                    |
| `summary.extraVolumeMounts`                           | Additional volumes to mount on the summary.                                        | `[]`               |
| `summary.extraVolumes`                                | Additional volumes to mount on the summary.                                        | `[]`               |
| `summary.pdb.enabled`                                 | Enable pdb on summary                                                              | `true`             |

### celery

| Name                                                 | Description                                                                       | Value       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| `celery.dpAnnotations`                               | Annotations to add to the celery Deployment                                       | `{}`        |
| `celery.command`                                     | Override the celery container command                                             | `[]`        |
| `celery.args`                                        | Override the celery container args                                                | `[]`        |
| `celery.replicas`                                    | Amount of celery replicas                                                         | `1`         |
| `celery.shareProcessNamespace`                       | Enable share process namespace between containers                                 | `false`     |
| `celery.sidecars`                                    | Add sidecars containers to celery deployment                                      | `[]`        |
| `celery.migrateJobAnnotations`                       | Annotations for the migrate job                                                   | `{}`        |
| `celery.securityContext`                             | Configure celery Pod security context                                             | `nil`       |
| `celery.envVars`                                     | Configure celery container environment variables                                  | `undefined` |
| `celery.envVars.BY_VALUE`                            | Example environment variable by setting value directly                            |             |
| `celery.envVars.FROM_CONFIGMAP.configMapKeyRef.name` | Name of a ConfigMap when configuring env vars from a ConfigMap                    |             |
| `celery.envVars.FROM_CONFIGMAP.configMapKeyRef.key`  | Key within a ConfigMap when configuring env vars from a ConfigMap                 |             |
| `celery.envVars.FROM_SECRET.secretKeyRef.name`       | Name of a Secret when configuring env vars from a Secret                          |             |
| `celery.envVars.FROM_SECRET.secretKeyRef.key`        | Key within a Secret when configuring env vars from a Secret                       |             |
| `celery.podAnnotations`                              | Annotations to add to the celery Pod                                              | `{}`        |
| `celery.service.type`                                | celery Service type                                                               | `ClusterIP` |
| `celery.service.port`                                | celery Service listening port                                                     | `80`        |
| `celery.service.targetPort`                          | celery container listening port                                                   | `8000`      |
| `celery.service.annotations`                         | Annotations to add to the celery Service                                          | `{}`        |
| `celery.probes`                                      | Configure celery probes                                                           | `{}`        |
| `celery.probes.liveness.path`                        | Configure path for celery HTTP liveness probe                                     | `undefined` |
| `celery.probes.liveness.targetPort`                  | Configure port for celery HTTP liveness probe                                     | `undefined` |
| `celery.probes.liveness.initialDelaySeconds`         | Configure initial delay for celery liveness probe                                 | `undefined` |
| `celery.probes.liveness.initialDelaySeconds`         | Configure timeout for celery liveness probe                                       | `undefined` |
| `celery.probes.startup.path`                         | Configure path for celery HTTP startup probe                                      | `undefined` |
| `celery.probes.startup.targetPort`                   | Configure port for celery HTTP startup probe                                      | `undefined` |
| `celery.probes.startup.initialDelaySeconds`          | Configure initial delay for celery startup probe                                  | `undefined` |
| `celery.probes.startup.initialDelaySeconds`          | Configure timeout for celery startup probe                                        | `undefined` |
| `celery.probes.readiness.path`                       | Configure path for celery HTTP readiness probe                                    | `undefined` |
| `celery.probes.readiness.targetPort`                 | Configure port for celery HTTP readiness probe                                    | `undefined` |
| `celery.probes.readiness.initialDelaySeconds`        | Configure initial delay for celery readiness probe                                | `undefined` |
| `celery.probes.readiness.initialDelaySeconds`        | Configure timeout for celery readiness probe                                      | `undefined` |
| `celery.resources`                                   | Resource requirements for the celery container                                    | `{}`        |
| `celery.nodeSelector`                                | Node selector for the celery Pod                                                  | `{}`        |
| `celery.tolerations`                                 | Tolerations for the celery Pod                                                    | `[]`        |
| `celery.affinity`                                    | Affinity for the celery Pod                                                       | `{}`        |
| `celery.persistence`                                 | Additional volumes to create and mount on the celery. Used for debugging purposes | `{}`        |
| `celery.persistence.volume-name.size`                | Size of the additional volume                                                     |             |
| `celery.persistence.volume-name.type`                | Type of the additional volume, persistentVolumeClaim or emptyDir                  |             |
| `celery.persistence.volume-name.mountPath`           | Path where the volume should be mounted to                                        |             |
| `celery.extraVolumeMounts`                           | Additional volumes to mount on the celery.                                        | `[]`        |
| `celery.extraVolumes`                                | Additional volumes to mount on the celery.                                        | `[]`        |
| `celery.pdb.enabled`                                 | Enable pdb on celery                                                              | `false`     |

### agents

| Name                                                 | Description                                                                       | Value                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- |
| `agents.image.repository`                            | Repository to use to pull meet's agents container image                           | `lasuite/meet-agents` |
| `agents.image.tag`                                   | meet's agents container tag                                                       | `latest`              |
| `agents.image.pullPolicy`                            | agents container image pull policy                                                | `IfNotPresent`        |
| `agents.dpAnnotations`                               | Annotations to add to the agents Deployment                                       | `{}`                  |
| `agents.command`                                     | Override the agents container command                                             | `[]`                  |
| `agents.args`                                        | Override the agents container args                                                | `[]`                  |
| `agents.replicas`                                    | Amount of agents replicas                                                         | `1`                   |
| `agents.shareProcessNamespace`                       | Enable share process namespace between containers                                 | `false`               |
| `agents.sidecars`                                    | Add sidecars containers to agents deployment                                      | `[]`                  |
| `agents.securityContext`                             | Configure agents Pod security context                                             | `nil`                 |
| `agents.envVars`                                     | Configure agents container environment variables                                  | `undefined`           |
| `agents.envVars.BY_VALUE`                            | Example environment variable by setting value directly                            |                       |
| `agents.envVars.FROM_CONFIGMAP.configMapKeyRef.name` | Name of a ConfigMap when configuring env vars from a ConfigMap                    |                       |
| `agents.envVars.FROM_CONFIGMAP.configMapKeyRef.key`  | Key within a ConfigMap when configuring env vars from a ConfigMap                 |                       |
| `agents.envVars.FROM_SECRET.secretKeyRef.name`       | Name of a Secret when configuring env vars from a Secret                          |                       |
| `agents.envVars.FROM_SECRET.secretKeyRef.key`        | Key within a Secret when configuring env vars from a Secret                       |                       |
| `agents.podAnnotations`                              | Annotations to add to the agents Pod                                              | `{}`                  |
| `agents.resources`                                   | Resource requirements for the agents container                                    | `{}`                  |
| `agents.nodeSelector`                                | Node selector for the agents Pod                                                  | `{}`                  |
| `agents.tolerations`                                 | Tolerations for the agents Pod                                                    | `[]`                  |
| `agents.affinity`                                    | Affinity for the agents Pod                                                       | `{}`                  |
| `agents.persistence`                                 | Additional volumes to create and mount on the agents. Used for debugging purposes | `{}`                  |
| `agents.persistence.volume-name.size`                | Size of the additional volume                                                     |                       |
| `agents.persistence.volume-name.type`                | Type of the additional volume, persistentVolumeClaim or emptyDir                  |                       |
| `agents.persistence.volume-name.mountPath`           | Path where the volume should be mounted to                                        |                       |
| `agents.extraVolumeMounts`                           | Additional volumes to mount on the agents.                                        | `[]`                  |
| `agents.extraVolumes`                                | Additional volumes to mount on the agents.                                        | `[]`                  |
| `agents.pdb.enabled`                                 | Enable pdb on agents                                                              | `false`               |
