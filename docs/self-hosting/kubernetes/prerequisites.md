# Prerequisites (Kubernetes)

The Kubernetes deployment uses the official Meet Helm chart, the same method used by DINUM in production. This guide targets production Kubernetes clusters. If you are deploying a small instance without Kubernetes expertise, use the [Docker Compose guide](../compose/prerequisites.md) instead.

## When to use Kubernetes

- High availability: multiple replicas with automatic failover
- Horizontal scaling: scale backend, frontend, and Celery workers independently
- Production-grade recording and transcription
- Multi-region or multi-zone deployments
- GitOps workflows and declarative infrastructure

## Required tools

### kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/kubectl
kubectl version --client
```

### Helm 3

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### helmfile (recommended for multi-environment)

```bash
brew install helmfile   # macOS / Linux with Homebrew
# or download binary: https://github.com/helmfile/helmfile/releases
```

## Cluster requirements

| Resource | Minimum | Recommended production |
|---|---|---|
| Nodes | 2 | 3+ |
| CPU per node | 2 cores | 4+ cores |
| RAM per node | 4 GB | 8+ GB |
| Kubernetes version | 1.27+ | Latest stable |

### Required cluster components

- **nginx-ingress controller**: the Meet Helm chart's recording ingress (`ingressMedia`) uses nginx-ingress annotations for authenticated MinIO proxying
- **cert-manager**: with a Let's Encrypt `ClusterIssuer` for automatic TLS
- **LoadBalancer or NodePort**: for LiveKit's UDP port (7882) and TCP media port (7881)

> nginx-ingress is required if you plan to enable recording. For basic video conferencing only, any ingress controller works.

## External services

For production, use managed services rather than running stateful workloads inside Kubernetes:

| Service | Purpose | Options |
|---|---|---|
| PostgreSQL | Meet database | OVH DBaaS, AWS RDS, Cloud SQL, Neon |
| Redis | Celery broker and LiveKit state | ElastiCache, Upstash, Aiven |
| S3-compatible storage | Recording file storage | AWS S3, Scaleway Object Storage, OVH Object Storage |
| SMTP | Recording download emails | Any SMTP relay |
| OIDC provider | User authentication | Keycloak, Dex, Auth0, ProConnect |

## Network requirements

LiveKit's media ports must be reachable from the public internet:

| Port | Protocol | Use |
|---|---|---|
| 443 | TCP | HTTPS (ingress) |
| 7881 | TCP | WebRTC ICE over TCP |
| 7882 | UDP | WebRTC media (RTP/RTCP) |

For UDP port 7882 in managed Kubernetes, use a **LoadBalancer** service with UDP support (supported by most cloud providers) or a **NodePort** with firewall rules opening the port on all nodes.

## DNS records

| Record | Points to |
|---|---|
| `meet.example.com` | Ingress load balancer IP |
| `livekit.example.com` | Ingress load balancer IP (WebSocket) |
| `auth.example.com` | Ingress load balancer IP (Keycloak) |

## Checklist

- [ ] kubectl configured for your cluster
- [ ] Helm 3 installed
- [ ] Kubernetes 1.27+ cluster running
- [ ] nginx-ingress controller deployed
- [ ] cert-manager deployed with a ClusterIssuer configured
- [ ] PostgreSQL reachable
- [ ] Redis reachable
- [ ] OIDC provider configured
- [ ] Domain names with DNS pointing to your ingress load balancer
- [ ] LiveKit media ports (7881/TCP, 7882/UDP) publicly accessible
- [ ] S3-compatible storage available (if using recording)
- [ ] SMTP relay configured (if using recording)
