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

- [PostgreSQL](https://www.postgresql.org/): Meet's database.
- [Redis](https://redis.io/): [Celery](https://docs.celeryq.dev/)'s queues and LiveKit's state.
- [S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)-compatible storage: [recordings](../configuration/recording.md) and uploaded backgrounds.
- An [SMTP](https://en.wikipedia.org/wiki/Simple_Mail_Transfer_Protocol) relay: [invitations and recording links](../configuration/email.md).
- An [OIDC](https://openid.net/developers/how-connect-works/) provider, such as [Keycloak](https://www.keycloak.org/) or [ProConnect](https://www.proconnect.gouv.fr/): signs users in.

## Three domain names

Point three subdomains at the ingress load balancer's IP before you install: cert-manager checks them to issue the HTTPS certificates.

| Subdomain | Serves |
|---|---|
| `meet.example.com` | Meet |
| `livekit.example.com` | LiveKit, through the same ingress, see [LiveKit on Kubernetes](helm.md#livekit-on-kubernetes) |
| `auth.example.com` | Your OIDC provider, if it runs in the cluster |

## Next

Continue to [Helm Deployment](helm.md).
