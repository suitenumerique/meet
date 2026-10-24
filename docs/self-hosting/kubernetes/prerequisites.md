# Prerequisites (Kubernetes)

The Kubernetes deployment uses the official Meet Helm chart and targets production clusters. For a small instance without Kubernetes expertise, use the [Docker Compose guide](../compose/prerequisites.md) instead.

## When to use Kubernetes

- High availability: multiple replicas with automatic failover
- Horizontal scaling: scale backend, frontend, and Celery workers independently
- Multi-region or multi-zone deployments
- GitOps workflows and declarative infrastructure

## Required tools

Install each from its upstream documentation:

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

- **An ingress controller**: any works for video conferencing alone. Recording and uploaded background images need nginx-ingress: their ingresses, `ingressMedia` and `ingressMediaFiles`, authenticate their proxying to the S3 storage with nginx-ingress annotations.
- **cert-manager**: with a Let's Encrypt `ClusterIssuer` for automatic TLS
- **Public IPs on the LiveKit nodes**: the chart serves LiveKit's media ports from the node itself through host networking

## External services

The chart does not deploy these. The example values in [Helm Deployment](helm.md) reach them at in-cluster hostnames such as `postgresql.meet.svc.cluster.local`; a managed service works the same way at its own address. For production, prefer managed services to running these stateful workloads in the cluster.

| Service | Purpose | Options |
|---|---|---|
| PostgreSQL | Meet database | OVH DBaaS, AWS RDS, Cloud SQL, Neon |
| Redis | Celery broker and LiveKit state | ElastiCache, Upstash, Aiven |
| S3-compatible storage | Recording file storage | AWS S3, Scaleway Object Storage, OVH Object Storage |
| SMTP | Recording download emails | Any SMTP relay |
| OIDC provider | User authentication | Keycloak, Dex, Auth0, ProConnect |

## Network requirements

The ports to open, on the ingress and on each node that runs LiveKit, are listed in [Firewall & Ports](../configuration/firewall.md).

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
