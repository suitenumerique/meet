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

When your k8s cluster is ready, you can start the deployment. This cluster is special because it uses the \*.127.0.0.1.nip.io domain and mkcert certificates to have full HTTPS support and easy domain name management.

Please remember that \*.127.0.0.1.nip.io will always resolve to 127.0.0.1, except in the k8s cluster where we configure CoreDNS to answer with the ingress-nginx service IP.

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

## All options

These are the environmental options available on meet backend.

| Option                                          | Description                              | default                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DJANGO_ALLOWED_HOSTS                            | Host that are allowed                    | []                                                                                                                                                            |
| DJANGO_SECRET_KEY                               | Secret key used                          |                                                                                                                                                               |
| DJANGO_SILENCED_SYSTEM_CHECKS                   | Silence system checks                    | []                                                                                                                                                            |
| DJANGO_ALLOW_UNSECURE_USER_LISTING              |                                          | false                                                                                                                                                         |
| DB_ENGINE                                       | Database engine used                     | django.db.backends.postgresql_psycopg2                                                                                                                        |
| DB_NAME                                         | name of the database                     | meet                                                                                                                                                          |
| DB_USER                                         | user used to connect to database         | dinum                                                                                                                                                         |
| DB_PASSWORD                                     | password used to connect to the database | pass                                                                                                                                                          |
| DB_HOST                                         | hostname of the database                 | localhost                                                                                                                                                     |
| DB_PORT                                         | port to connect to database              | 5432                                                                                                                                                          |
| STORAGES_STATICFILES_BACKEND                    | Static file serving engine               | whitenoise.storage.CompressedManifestStaticFilesStorage                                                                                                       |
| AWS_S3_ENDPOINT_URL                             | S3 host endpoint                         |                                                                                                                                                               |
| AWS_S3_ACCESS_KEY_ID                            | s3 access key                            |                                                                                                                                                               |
| AWS_S3_SECRET_ACCESS_KEY                        | s3 secret key                            |                                                                                                                                                               |
| AWS_S3_REGION_NAME                              | s3 region                                |                                                                                                                                                               |
| AWS_STORAGE_BUCKET_NAME                         | s3 bucket name                           |                                                                                                                                                               |
| DJANGO_LANGUAGE_CODE                            | Default language                         | en-us                                                                                                                                                         |
| REDIS_URL                                       | redis endpoint                           | redis://redis:6379/1                                                                                                                                          |
| REQUEST_ENTRY_THROTTLE_RATES                    | throttle rates                           | 150/minute                                                                                                                                                    |
| SPECTACULAR_SETTINGS_ENABLE_DJANGO_DEPLOY_CHECK | deploy check                             | False                                                                                                                                                         |
| FRONTEND_ANALYTICS                              | analytics information                    | {}                                                                                                                                                            |
| FRONTEND_SUPPORT                                | crisp frontend support                   | {}                                                                                                                                                            |
| FRONTEND_SILENCE_LIVEKIT_DEBUG                  | silence livekit debug                    | false                                                                                                                                                         |
| DJANGO_EMAIL_BACKEND                            | email backend library                    | django.core.mail.backends.smtp.EmailBackend                                                                                                                   |
| DJANGO_EMAIL_HOST                               | host of the email server                 |                                                                                                                                                               |
| DJANGO_EMAIL_HOST_USER                          | user to connect to the email server      |                                                                                                                                                               |
| DJANGO_EMAIL_HOST_PASSWORD                      | password to connect tto the email server |                                                                                                                                                               |
| DJANGO_EMAIL_PORT                               | por tot connect to the email server      |                                                                                                                                                               |
| DJANGO_EMAIL_USE_TLS                            | enable tls on email connection           | false                                                                                                                                                         |
| DJANGO_EMAIL_USE_SSL                            | enable tls on email connection           | false                                                                                                                                                         |
| DJANGO_EMAIL_FROM                               | email from account                       | from@example.com                                                                                                                                              |
| DJANGO_CORS_ALLOW_ALL_ORIGINS                   | allow all cors origins                   | true                                                                                                                                                          |
| DJANGO_CORS_ALLOWED_ORIGINS                     | origins to allow in string               | []                                                                                                                                                            |
| DJANGO_CORS_ALLOWED_ORIGIN_REGEXES              | origins to allow in regex                | []                                                                                                                                                            |
| SENTRY_DSN                                      | sentry server                            |                                                                                                                                                               |
| DJANGO_CELERY_BROKER_URL                        | celery broker host                       | redis://redis:6379/0                                                                                                                                          |
| DJANGO_CELERY_BROKER_TRANSPORT_OPTIONS          | celery broker options                    | {}                                                                                                                                                            |
| OIDC_CREATE_USER                                | create oidc user if not exists           | false                                                                                                                                                         |
| OIDC_VERIFY_SSL                                 | verify ssl for oidc                      | true                                                                                                                                                          |
| OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION       | fallback to email for identification     | false                                                                                                                                                         |
| OIDC_RP_SIGN_ALGO                               | token verification algoritm used by oidc | RS256                                                                                                                                                         |
| OIDC_RP_CLIENT_ID                               | oidc client                              | meet                                                                                                                                                          |
| OIDC_RP_CLIENT_SECRET                           | oidc client secret                       |                                                                                                                                                               |
| OIDC_OP_JWKS_ENDPOINT                           | oidc endpoint for JWKS                   |                                                                                                                                                               |
| OIDC_OP_AUTHORIZATION_ENDPOINT                  | oidc endpoint for authorization          |                                                                                                                                                               |
| OIDC_OP_TOKEN_ENDPOINT                          | oidc endpoint for token                  |                                                                                                                                                               |
| OIDC_OP_USER_ENDPOINT                           | oidc endpoint for user                   |                                                                                                                                                               |
| OIDC_OP_LOGOUT_ENDPOINT                         | oidc endpoint for logout                 |                                                                                                                                                               |
| OIDC_AUTH_REQUEST_EXTRA_PARAMS                  | extra parameters for oidc request        |                                                                                                                                                               |
| OIDC_RP_SCOPES                                  | oidc scopes                              | openid email                                                                                                                                                  |
| LOGIN_REDIRECT_URL                              | login redirect url                       |                                                                                                                                                               |
| LOGIN_REDIRECT_URL_FAILURE                      | login redurect url for failure           |                                                                                                                                                               |
| LOGOUT_REDIRECT_URL                             | url to redirect to on logout             |                                                                                                                                                               |
| OIDC_USE_NONCE                                  | use nonce for oidc                       | true                                                                                                                                                          |
| OIDC_REDIRECT_REQUIRE_HTTPS                     | require https for oidc                   | false                                                                                                                                                         |
| OIDC_REDIRECT_ALLOWED_HOSTS                     | allowed redirect hosts for oidc          | []                                                                                                                                                            |
| OIDC_STORE_ID_TOKEN                             | store oidc ID token                      | true                                                                                                                                                          |
| ALLOW_LOGOUT_GET_METHOD                         | allow logout through get method          | true                                                                                                                                                          |
| OIDC_REDIRECT_FIELD_NAME                        | direct field for oidc                    | returnTo                                                                                                                                                      |
| OIDC_USERINFO_FULLNAME_FIELDS                   | full name claim from OIDC token          | ["given_name", "usual_name"]                                                                                                                                  |
| OIDC_USERINFO_SHORTNAME_FIELD                   | shortname claim from OIDC token          | given_name                                                                                                                                                    |
| LIVEKIT_API_KEY                                 | livekit api key                          |                                                                                                                                                               |
| LIVEKIT_API_SECRET                              | livekit api secret                       |                                                                                                                                                               |
| LIVEKIT_API_URL                                 | livekit api url                          |                                                                                                                                                               |
| RESOURCE_DEFAULT_ACCESS_LEVEL                   | default resource access level for rooms  | public                                                                                                                                                        |
| ALLOW_UNREGISTERED_ROOMS                        | Allow usage of unregistered rooms        | true                                                                                                                                                          |
| RECORDING_ENABLE                                | record meeting option                    | false                                                                                                                                                         |
| RECORDING_OUTPUT_FOLDER                         | folder to store meetings                 | recordings                                                                                                                                                    |
| RECORDING_WORKER_CLASSES                        | worker classes for recording             | {"screen_recording": "core.recording.worker.services.VideoCompositeEgressService","transcript": "core.recording.worker.services.AudioCompositeEgressService"} |
| RECORDING_EVENT_PARSER_CLASS                    | storage event engine for recording       | core.recording.event.parsers.MinioParser                                                                                                                      |
| RECORDING_ENABLE_STORAGE_EVENT_AUTH             | enable storage event authorization       | true                                                                                                                                                          |
| RECORDING_STORAGE_EVENT_ENABLE                  | enable recording storage events          | false                                                                                                                                                         |
| RECORDING_STORAGE_EVENT_TOKEN                   | recording storage event token            |                                                                                                                                                               |
| SUMMARY_SERVICE_ENDPOINT                        | summary service endpoint                 |                                                                                                                                                               |
| SUMMARY_SERVICE_API_TOKEN                       | api token voor summary service           |                                                                                                                                                               |
| SIGNUP_NEW_USER_TO_MARKETING_EMAIL              | signup users to marketing emails         | false                                                                                                                                                         |
| MARKETING_SERVICE_CLASS                         | markering class                          | core.services.marketing.BrevoMarketingService                                                                                                                 |
| BREVO_API_KEY                                   | breva api key for marketing emails       |                                                                                                                                                               |
| BREVO_API_CONTACT_LIST_IDS                      | brevo api contact list ids               | []                                                                                                                                                            |
| DJANGO_BREVO_API_CONTACT_ATTRIBUTES             | brevo contact attributes                 | {"VISIO_USER": True}                                                                                                                                          |
| BREVO_API_TIMEOUT                               | brevo timeout                            | 1                                                                                                                                                             |
| LOBBY_KEY_PREFIX                                | lobby prefix                             | room_lobby                                                                                                                                                    |
| LOBBY_WAITING_TIMEOUT                           | lobby waiting tumeout                    | 3                                                                                                                                                             |
| LOBBY_DENIED_TIMEOUT                            | lobby deny timeout                       | 5                                                                                                                                                             |
| LOBBY_ACCEPTED_TIMEOUT                          | lobby accept timeout                     | 21600                                                                                                                                                         |
| LOBBY_NOTIFICATION_TYPE                         | lobby notification types                 | participantWaiting                                                                                                                                            |
| LOBBY_COOKIE_NAME                               | lobby cookie name                        | lobbyParticipantId                                                                                                                                            |
