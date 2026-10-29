# Prerequisites (Kubernetes)

For a single server, see the [Docker Compose prerequisites](../compose/prerequisites.md).

## A cluster

Any Kubernetes cluster, with the [ports](../configuration/firewall.md) open on the ingress and on each node that runs LiveKit. Start from these sizes, then watch the load:

| Resource | Minimum | Recommended |
|---|---|---|
| Nodes | 2 | 3+ |
| CPU per node | 2 cores | 4+ cores |
| RAM per node | 4 GB | 8+ GB |

The chart does not install these:

- **An ingress controller.** Any works for calls; recording and uploaded backgrounds need nginx-ingress, whose annotations their ingresses use.
- **cert-manager**, with a Let's Encrypt `ClusterIssuer`.
- **A public IP on each LiveKit node**: call media goes straight to the node, not through the ingress.

## Tools

- [kubectl](https://kubernetes.io/docs/tasks/tools/), configured for your cluster
- [Helm 3](https://helm.sh/docs/intro/install/)
- [helmfile](https://github.com/helmfile/helmfile/releases), optional, for several environments

## External services

The chart deploys none of these, and managed services suit production. The [Helm Deployment](helm.md) examples use in-cluster hostnames such as `postgresql.meet.svc.cluster.local`: put yours instead.

| Service | Holds | Options |
|---|---|---|
| PostgreSQL | Meet's database | OVH DBaaS, AWS RDS, Cloud SQL, Neon |
| Redis | Celery's queues and LiveKit's state | ElastiCache, Upstash, Aiven |
| S3-compatible storage | Recordings and uploaded backgrounds | AWS S3, Scaleway Object Storage, OVH Object Storage |
| SMTP | Sends invitations and recording links | Any SMTP relay |
| OIDC provider | Signs users in | Keycloak, Dex, Auth0, ProConnect |

## Three domain names

Point three subdomains at the ingress load balancer's IP before you install: cert-manager checks them to issue the HTTPS certificates.

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet |
| `livekit.example.com` | LiveKit, through the same ingress, see [LiveKit on Kubernetes](helm.md#livekit-on-kubernetes) |
| `auth.example.com` | Your OIDC provider, if it runs in the cluster |

## Next

Continue to [Helm Deployment](helm.md).
