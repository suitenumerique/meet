# Prerequisites (Kubernetes)

Once everything here is in place, [Helm Deployment](helm.md) installs Meet on your production cluster with the official Helm chart. To only try Meet, run [Quick Start](../compose/quick-start.md) on a single server first; for a small instance without Kubernetes expertise, use the [Docker Compose guide](../compose/prerequisites.md).

## When to use Kubernetes

Kubernetes pays off for high availability (replicas with automatic failover), scaling the backend, frontend and Celery workers independently, multi-region or multi-zone deployments, and GitOps.

## Required tools

- [kubectl](https://kubernetes.io/docs/tasks/tools/), configured for your cluster
- [Helm 3](https://helm.sh/docs/intro/install/)
- [helmfile](https://github.com/helmfile/helmfile/releases), optional, for several environments

## Cluster requirements

| Resource | Minimum | Recommended production |
|---|---|---|
| Nodes | 2 | 3+ |
| CPU per node | 2 cores | 4+ cores |
| RAM per node | 4 GB | 8+ GB |

### Required cluster components

The Meet chart relies on these but does not install them:

- **An ingress controller**: any works for video conferencing alone. Recording and uploaded background images need nginx-ingress: their ingresses, `ingressMedia` and `ingressMediaFiles`, authenticate their proxying to the S3 storage with nginx-ingress annotations.
- **cert-manager**: with a Let's Encrypt `ClusterIssuer` for automatic TLS
- **Public IPs on the LiveKit nodes**: LiveKit's Helm chart serves its media ports from the node itself through host networking

## External services

The chart does not deploy these; the OIDC provider is the identity service that signs users in. Prefer managed services in production. The [Helm Deployment](helm.md) examples use in-cluster hostnames such as `postgresql.meet.svc.cluster.local`: use your service's address instead.

| Service | Purpose | Options |
|---|---|---|
| PostgreSQL | Meet database | OVH DBaaS, AWS RDS, Cloud SQL, Neon |
| Redis | Celery broker and LiveKit state | ElastiCache, Upstash, Aiven |
| S3-compatible storage | Recording file storage | AWS S3, Scaleway Object Storage, OVH Object Storage |
| SMTP | Recording download emails | Any SMTP relay |
| OIDC provider | User authentication | Keycloak, Dex, Auth0, ProConnect |

## Network requirements

Call media reaches LiveKit on its nodes directly, bypassing the ingress. The ports to open, on the ingress and on each node that runs LiveKit, are listed in [Firewall & Ports](../configuration/firewall.md).

## DNS records

| Record | Points to |
|---|---|
| `meet.example.com` | Ingress load balancer IP |
| `livekit.example.com` | Ingress load balancer IP: the [LiveKit values](helm.md#livekit-on-kubernetes) expose it through the same nginx-ingress |
| `auth.example.com` | Ingress load balancer IP (OIDC provider) |

## Checklist

- [ ] kubectl configured for your cluster
- [ ] Helm 3 installed
- [ ] An ingress controller deployed, nginx-ingress if you use recording or uploaded backgrounds
- [ ] cert-manager deployed with a ClusterIssuer configured
- [ ] PostgreSQL reachable
- [ ] Redis reachable
- [ ] OIDC provider configured
- [ ] Domain names with DNS pointing to your ingress load balancer
- [ ] The ports in [Firewall & Ports](../configuration/firewall.md) open
- [ ] S3-compatible storage available (if using recording)
- [ ] SMTP relay configured (if using recording)

## Next

With every box ticked, continue to [Helm Deployment](helm.md).
