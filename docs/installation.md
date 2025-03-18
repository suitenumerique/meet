# Installation on a k8s cluster

This document is a step-by-step guide that describes how to install Visio on a k8s cluster without AI features.


## Prerequisites

- k8s cluster with an nginx-ingress controller
- an OIDC provider (if you don't have one, we will provide an example)
- a LiveKit server (if you don't have one, we will provide an example)
- a PostgreSQL server (if you don't have one, we will provide an example)
- a Memcached server (if you don't have one, we will provide an example)

### Test cluster

If you do not have a test cluster, you can install everything on a local kind cluster. In this case, the simplest way is to use our script **bin/start-kind.sh**.

To be able to use the script, you will need to install:

- Docker (https://docs.docker.com/desktop/)
- Kind (https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- Mkcert (https://github.com/FiloSottile/mkcert#installation)
- Helm (https://helm.sh/docs/intro/quickstart/#install-helm)

```
$ ./bin/start-kind.sh
0. Create ca
The local CA is already installed in the system trust store! 👍
The local CA is already installed in the Firefox and/or Chrome/Chromium trust store! 👍


Created a new certificate valid for the following names 📜
 - "127.0.0.1.nip.io"
 - "*.127.0.0.1.nip.io"

Reminder: X.509 wildcards only go one level deep, so this won't match a.b.127.0.0.1.nip.io ℹ️

The certificate is at "./127.0.0.1.nip.io+1.pem" and the key at "./127.0.0.1.nip.io+1-key.pem" ✅

It will expire on 23 March 2027 🗓

1. Create registry container unless it already exists
2. Create kind cluster with containerd registry config dir enabled
Creating cluster "visio" ...
 ✓ Ensuring node image (kindest/node:v1.27.3) 🖼
 ✓ Preparing nodes 📦  
 ✓ Writing configuration 📜 
 ✓ Starting control-plane 🕹️ 
 ✓ Installing CNI 🔌 
 ✓ Installing StorageClass 💾 
Set kubectl context to "kind-visio"
You can now use your cluster with:

kubectl cluster-info --context kind-visio

Thanks for using kind! 😊
3. Add the registry config to the nodes
4. Connect the registry to the cluster network if not already connected
5. Document the local registry
configmap/local-registry-hosting created
Warning: resource configmaps/coredns is missing the kubectl.kubernetes.io/last-applied-configuration annotation which is required by kubectl apply. kubectl apply should only be used on resources created declaratively by either kubectl create --save-config or kubectl apply. The missing annotation will be patched automatically.
configmap/coredns configured
deployment.apps/coredns restarted
6. Install ingress-nginx
namespace/ingress-nginx created
serviceaccount/ingress-nginx created
serviceaccount/ingress-nginx-admission created
role.rbac.authorization.k8s.io/ingress-nginx created
role.rbac.authorization.k8s.io/ingress-nginx-admission created
clusterrole.rbac.authorization.k8s.io/ingress-nginx created
clusterrole.rbac.authorization.k8s.io/ingress-nginx-admission created
rolebinding.rbac.authorization.k8s.io/ingress-nginx created
rolebinding.rbac.authorization.k8s.io/ingress-nginx-admission created
clusterrolebinding.rbac.authorization.k8s.io/ingress-nginx created
clusterrolebinding.rbac.authorization.k8s.io/ingress-nginx-admission created
configmap/ingress-nginx-controller created
service/ingress-nginx-controller created
service/ingress-nginx-controller-admission created
deployment.apps/ingress-nginx-controller created
job.batch/ingress-nginx-admission-create created
job.batch/ingress-nginx-admission-patch created
ingressclass.networking.k8s.io/nginx created
validatingwebhookconfiguration.admissionregistration.k8s.io/ingress-nginx-admission created
secret/mkcert created
deployment.apps/ingress-nginx-controller patched
7. Setup namespace
namespace/meet created
Context "kind-visio" modified.
secret/mkcert created
$ kind get clusters
visio
$ kubectl -n ingress-nginx get po
NAME                                        READY   STATUS      RESTARTS   AGE
ingress-nginx-admission-create-jgnc9        0/1     Completed   0          2m44s
ingress-nginx-admission-patch-wrt47         0/1     Completed   0          2m44s
ingress-nginx-controller-57c548c4cd-9xwt6   1/1     Running     0          2m44s
```
When your k8s cluster is ready, you can start the deployment. This cluster is special because it uses the *.127.0.0.1.nip.io domain and mkcert certificates to have full HTTPS support and easy domain name management.

Please remember that *.127.0.0.1.nip.io will always resolve to 127.0.0.1, except in the k8s cluster where we configure CoreDNS to answer with the ingress-nginx service IP.

## Preparation

### What will you use to authenticate your users ? 

Visio uses OIDC, so if you already have an OIDC provider, obtain the necessary information to use it. In the next step, we will see how to configure Django (and thus Visio) to use it. If you do not have a provider, we will show you how to deploy a local Keycloak instance (this is not a production deployment, just a demo).

If you haven't run the script **bin/start-kind.sh**, you'll need to manually create the namespace by running the following command:

```
$ kubectl create namespace meet
```

If you have already run the script, you can skip this step and proceed to the next instruction.

```
$ kubectl config set-context --current --namespace=meet
$ helm install keycloak oci://registry-1.docker.io/bitnamicharts/keycloak -f examples/keycloak.values.yaml
$ #wait until
$ kubectl get po
NAME                    READY   STATUS    RESTARTS   AGE
keycloak-0              1/1     Running   0          6m48s
keycloak-postgresql-0   1/1     Running   0          6m48s
```

From here the important information you will need are :

```
OIDC_OP_JWKS_ENDPOINT: https://keycloak.127.0.0.1.nip.io/realms/meet/protocol/openid-connect/certs
OIDC_OP_AUTHORIZATION_ENDPOINT: https://keycloak.127.0.0.1.nip.io/realms/meet/protocol/openid-connect/auth
OIDC_OP_TOKEN_ENDPOINT: https://keycloak.127.0.0.1.nip.io/realms/meet/protocol/openid-connect/token
OIDC_OP_USER_ENDPOINT: https://keycloak.127.0.0.1.nip.io/realms/meet/protocol/openid-connect/userinfo
OIDC_OP_LOGOUT_ENDPOINT: https://keycloak.127.0.0.1.nip.io/realms/meet/protocol/openid-connect/session/end
OIDC_RP_CLIENT_ID: meet
OIDC_RP_CLIENT_SECRET: ThisIsAnExampleKeyForDevPurposeOnly
OIDC_RP_SIGN_ALGO: RS256
OIDC_RP_SCOPES: "openid email"
```

You can find these values in **examples/keycloak.values.yaml**

### Find livekit server connexion values

Visio use livekit for streaming part so if you have a livekit provider, obtain the necessary information to use it. If you do not have a provider, you can install a livekit testing environment as follows:

Livekit need a redis (and meet too) so we will start by deploying a redis :

```
$ helm install redis oci://registry-1.docker.io/bitnamicharts/redis -f examples/redis.values.yaml
$ kubectl get po
NAME                    READY   STATUS    RESTARTS   AGE
keycloak-0              1/1     Running   0          26m
keycloak-postgresql-0   1/1     Running   0          26m
redis-master-0          1/1     Running   0          35s
```
When the redis is ready we can deploy livekit-server.

```
$ helm repo add livekit https://helm.livekit.io
$ helm repo update
$ helm install livekit livekit/livekit-server -f examples/livekit.values.yaml
$ kubectl get po
NAME                                      READY   STATUS    RESTARTS   AGE
keycloak-0                                1/1     Running   0          30m
keycloak-postgresql-0                     1/1     Running   0          30m
livekit-livekit-server-5c5fb87f7f-ct6x5   1/1     Running   0          7s
redis-master-0                            1/1     Running   0          4m30s
$ curl https://livekit.127.0.0.1.nip.io
OK
```

From here important information you will need are :

```
LIVEKIT_API_SECRET: secret
LIVEKIT_API_KEY: devkey
LIVEKIT_API_URL: https://livekit.127.0.0.1.nip.io/
REDIS_URL: redis://default:pass@redis-master:6379/1
CELERY_BROKER_URL: redis://default:pass@redis-master:6379/1
CELERY_RESULT_BACKEND: redis://default:pass@redis-master:6379/1
```

### Find postgresql connexion values

Visio uses a postgresql db as backend so if you have a provider, obtain the necessary information to use it. If you do not have, you can install a postgresql testing environment as follows:

```
$ helm install postgresql oci://registry-1.docker.io/bitnamicharts/postgresql -f examples/postgresql.values.yaml
$ kubectl get po
NAME                                      READY   STATUS    RESTARTS   AGE
keycloak-0                                1/1     Running   0          45m
keycloak-postgresql-0                     1/1     Running   0          45m
livekit-livekit-server-5c5fb87f7f-ct6x5   1/1     Running   0          15m
postgresql-0                              1/1     Running   0          50s
redis-master-0                            1/1     Running   0          19
```
From here important information you will need are :

```
DB_HOST: postgres-postgresql
DB_NAME: meet
DB_USER: dinum
DB_PASSWORD: pass
DB_PORT: 5432
POSTGRES_DB: meet
POSTGRES_USER: dinum
POSTGRES_PASSWORD: pass
```

## Deployment

Now you are ready to deploy Visio without AI. AI required more dependencies (Openai-compliant API, LiveKit Egress, Cold storage and a docs deployment to push resumes). To deploy meet you need to provide all previous information to the helm chart.

```
$ helm repo add meet https://suitenumerique.github.io/meet/
$ helm repo update
$ helm install meet meet/meet -f examples/meet.values.yaml
```

## Test your deployment

In order to test your deployment you have to log in to your instance. If you use exclusively our examples you can do:

```
$ kubectl get ingress
NAME                     CLASS    HOSTS                       ADDRESS     PORTS     AGE
keycloak                 <none>   keycloak.127.0.0.1.nip.io   localhost   80        58m
livekit-livekit-server   <none>   livekit.127.0.0.1.nip.io    localhost   80, 443   106m
meet                     <none>   meet.127.0.0.1.nip.io       localhost   80, 443   52m
meet-admin               <none>   meet.127.0.0.1.nip.io       localhost   80, 443   52m
```

You can use Visio on https://meet.127.0.0.1.nip.io. The provisioning user in keycloak is meet/meet.
