# Installation on a k8s cluster

This document is a step-by-step guide that describes how to install Visio on a k8s cluster without AI features.

## Prerequisites for a kubernetes setup

- k8s cluster with an nginx-ingress controller
- an OIDC provider (if you don't have one, we will provide an example)
- a LiveKit server (if you don't have one, we will provide an example)
- a PostgreSQL server (if you don't have one, we will provide an example)
- a Memcached server (if you don't have one, we will provide an example)

### Test cluster

If you do not have a kubernetes test cluster, you can install everything on a local kind cluster. In this case, the simplest way is to use our script located in this repo under **bin/start-kind.sh**.

IMPORTANT: The kind method will only deploy meet as a local instance(127.0.0.1) that can only be accessed from the device where it has been deployed. 

To be able to use the script, you will need to install the following components:

- Docker (https://docs.docker.com/desktop/)
- Kind (https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- Mkcert (https://github.com/FiloSottile/mkcert#installation)
- Helm (https://helm.sh/docs/intro/quickstart/#install-helm)
- kubectl (https://kubernetes.io/docs/tasks/tools/)

In order to initiate the local kind installation via **start-kind.sh** do the following:
1) Make sure administrator/root user context is able to execute mkcert, docker, kind etc. commands or the script might fail
2) Download the script to the device where the above components are installed
3) Make the script executable
4) Run the script with proper permissions (administrator/sudo etc.)

The output of the script will resemble the below example:

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

## Preparation of components

### What will you use to authenticate your users ?

Visio uses OIDC, so if you already have an OIDC provider, obtain the necessary information to use it. In the next step, we will see how to configure Django (and thus Visio) to use it. If you do not have a provider, we will show you how to deploy a local Keycloak instance (this is not a production deployment, just a demo).

If you haven't run the script **bin/start-kind.sh**, you'll need to manually create the namespace by running the following command:

```
$ kubectl create namespace meet
```

If you have already run the script, you can skip this step and proceed to the next instruction. NOTE: Before you proceed, and is using the kind method, make sure you download this repo examples/ directory and its contents to the location where you will be executing the helm command. Helm will look for "examples/<name>values.yaml" from based on the path it is being executed.

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

You can use Visio on https://meet.127.0.0.1.nip.io from the local device. The provisioning user in keycloak is meet/meet.

## All options

These are the environmental options available on meet backend.

| Option                                          | Description                              | default                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------- |---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| DATA_DIR                                        | Data directory location                  | /data                                                                                                                                                         |
| DJANGO_ALLOWED_HOSTS                            | Hosts that are allowed                   | []                                                                                                                                                            |
| DJANGO_SECRET_KEY                               | Secret key used for Django security      |                                                                                                                                                               |
| DJANGO_SILENCED_SYSTEM_CHECKS                   | Silence Django system checks             | []                                                                                                                                                            |
| DJANGO_ALLOW_UNSECURE_USER_LISTING              | Allow unsecure user listing              | false                                                                                                                                                         |
| DB_ENGINE                                       | Database engine used                     | django.db.backends.postgresql_psycopg2                                                                                                                        |
| DB_NAME                                         | Name of the database                     | meet                                                                                                                                                          |
| DB_USER                                         | User used to connect to database         | dinum                                                                                                                                                         |
| DB_PASSWORD                                     | Password used to connect to the database | pass                                                                                                                                                          |
| DB_HOST                                         | Hostname of the database                 | localhost                                                                                                                                                     |
| DB_PORT                                         | Port to connect to database              | 5432                                                                                                                                                          |
| STORAGES_STATICFILES_BACKEND                    | Static file serving engine               | whitenoise.storage.CompressedManifestStaticFilesStorage                                                                                                       |
| AWS_S3_ENDPOINT_URL                             | S3 host endpoint                         |                                                                                                                                                               |
| AWS_S3_ACCESS_KEY_ID                            | S3 access key                            |                                                                                                                                                               |
| AWS_S3_SECRET_ACCESS_KEY                        | S3 secret key                            |                                                                                                                                                               |
| AWS_S3_REGION_NAME                              | S3 region                                |                                                                                                                                                               |
| AWS_STORAGE_BUCKET_NAME                         | S3 bucket name                           | meet-media-storage                                                                                                                                            |
| DJANGO_LANGUAGE_CODE                            | Default language                         | en-us                                                                                                                                                         |
| REDIS_URL                                       | Redis endpoint                           | redis://redis:6379/1                                                                                                                                          |
| SESSION_COOKIE_AGE                              | Session cookie expiration in seconds     | 43200 (12 hours)                                                                                                                                              |
| REQUEST_ENTRY_THROTTLE_RATES                    | Entry request throttle rates             | 150/minute                                                                                                                                                    |
| CREATION_CALLBACK_THROTTLE_RATES                | Creation callback throttle rates         | 600/minute                                                                                                                                                    |
| SPECTACULAR_SETTINGS_ENABLE_DJANGO_DEPLOY_CHECK | Enable Django deploy check               | false                                                                                                                                                         |
| CSRF_TRUSTED_ORIGINS                            | CSRF trusted origins list                | []                                                                                                                                                            |
| FRONTEND_CUSTOM_CSS_URL                         | URL of an additional CSS file to load in the frontend app. If set, a `<link>` tag with this URL as href is added to the `<head>` of the frontend app | |
| FRONTEND_ANALYTICS                              | Analytics information                    | {}                                                                                                                                                            |
| FRONTEND_SUPPORT                                | Crisp frontend support configuration     | {}                                                                                                                                                            |
| FRONTEND_SILENCE_LIVEKIT_DEBUG                  | Silence LiveKit debug logs               | false                                                                                                                                                         |
| FRONTEND_IS_SILENT_LOGIN_ENABLED                | Enable silent login feature             | true                                                                                                                                                          |
| FRONTEND_FEEDBACK                               | Frontend feedback configuration          | {}                                                                                                                                                            |
| FRONTEND_USE_FRENCH_GOV_FOOTER                  | Show the French government footer in the homepage | false |
| DJANGO_EMAIL_BACKEND                            | Email backend library                    | django.core.mail.backends.smtp.EmailBackend                                                                                                                   |
| DJANGO_EMAIL_HOST                               | Host of the email server                 |                                                                                                                                                               |
| DJANGO_EMAIL_HOST_USER                          | User to connect to the email server      |                                                                                                                                                               |
| DJANGO_EMAIL_HOST_PASSWORD                      | Password to connect to the email server  |                                                                                                                                                               |
| DJANGO_EMAIL_PORT                               | Port to connect to the email server      |                                                                                                                                                               |
| DJANGO_EMAIL_USE_TLS                            | Enable TLS on email connection           | false                                                                                                                                                         |
| DJANGO_EMAIL_USE_SSL                            | Enable SSL on email connection           | false                                                                                                                                                         |
| DJANGO_EMAIL_FROM                               | Email from account                       | from@example.com                                                                                                                                              |
| EMAIL_BRAND_NAME                                | Email branding name                      |                                                                                                                                                               |
| EMAIL_SUPPORT_EMAIL                             | Support email address                    |                                                                                                                                                               |
| EMAIL_LOGO_IMG                                  | Email logo image                         |                                                                                                                                                               |
| EMAIL_DOMAIN                                    | Email domain                             |                                                                                                                                                               |
| EMAIL_APP_BASE_URL                              | Email app base URL                       |                                                                                                                                                               |
| DJANGO_CORS_ALLOW_ALL_ORIGINS                   | Allow all CORS origins                   | false                                                                                                                                                         |
| DJANGO_CORS_ALLOWED_ORIGINS                     | Origins to allow (string list)           | []                                                                                                                                                            |
| DJANGO_CORS_ALLOWED_ORIGIN_REGEXES              | Origins to allow (regex patterns)        | []                                                                                                                                                            |
| SENTRY_DSN                                      | Sentry server DSN                        |                                                                                                                                                               |
| DJANGO_CELERY_BROKER_URL                        | Celery broker host                       | redis://redis:6379/0                                                                                                                                          |
| DJANGO_CELERY_BROKER_TRANSPORT_OPTIONS          | Celery broker options                    | {}                                                                                                                                                            |
| OIDC_CREATE_USER                                | Create OIDC user if not exists           | true                                                                                                                                                          |
| OIDC_VERIFY_SSL                                 | Verify SSL for OIDC                      | true                                                                                                                                                          |
| OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION       | Fallback to email for identification     | false                                                                                                                                                         |
| OIDC_RP_SIGN_ALGO                               | Token verification algorithm used by OIDC | RS256                                                                                                                                                         |
| OIDC_RP_CLIENT_ID                               | OIDC client ID                           | meet                                                                                                                                                          |
| OIDC_RP_CLIENT_SECRET                           | OIDC client secret                       |                                                                                                                                                               |
| OIDC_OP_JWKS_ENDPOINT                           | OIDC endpoint for JWKS                   |                                                                                                                                                               |
| OIDC_OP_AUTHORIZATION_ENDPOINT                  | OIDC endpoint for authorization          |                                                                                                                                                               |
| OIDC_OP_TOKEN_ENDPOINT                          | OIDC endpoint for token                  |                                                                                                                                                               |
| OIDC_OP_USER_ENDPOINT                           | OIDC endpoint for user                   |                                                                                                                                                               |
| OIDC_OP_USER_ENDPOINT_FORMAT                    | OIDC endpoint format (AUTO, JWT, JSON)   | AUTO                                                                                                                                                          |
| OIDC_OP_LOGOUT_ENDPOINT                         | OIDC endpoint for logout                 |                                                                                                                                                               |
| OIDC_AUTH_REQUEST_EXTRA_PARAMS                  | Extra parameters for OIDC request        | {}                                                                                                                                                            |
| OIDC_RP_SCOPES                                  | OIDC scopes                              | openid email                                                                                                                                                  |
| OIDC_USE_NONCE                                  | Use nonce for OIDC                       | true                                                                                                                                                          |
| OIDC_REDIRECT_REQUIRE_HTTPS                     | Require HTTPS for OIDC                   | false                                                                                                                                                         |
| OIDC_REDIRECT_ALLOWED_HOSTS                     | Allowed redirect hosts for OIDC          | []                                                                                                                                                            |
| OIDC_STORE_ID_TOKEN                             | Store OIDC ID token                      | true                                                                                                                                                          |
| OIDC_REDIRECT_FIELD_NAME                        | Redirect field for OIDC                  | returnTo                                                                                                                                                      |
| OIDC_USERINFO_FULLNAME_FIELDS                   | Full name claim from OIDC token          | ["given_name", "usual_name"]                                                                                                                                  |
| OIDC_USERINFO_SHORTNAME_FIELD                   | Short name claim from OIDC token         | given_name                                                                                                                                                    |
| OIDC_USERINFO_ESSENTIAL_CLAIMS                  | Required claims from OIDC token          | []                                                                                                                                                            |
| LOGIN_REDIRECT_URL                              | Login redirect URL                       |                                                                                                                                                               |
| LOGIN_REDIRECT_URL_FAILURE                      | Login redirect URL for failure           |                                                                                                                                                               |
| LOGOUT_REDIRECT_URL                             | URL to redirect to on logout             |                                                                                                                                                               |
| ALLOW_LOGOUT_GET_METHOD                         | Allow logout through GET method          | true                                                                                                                                                          |
| LIVEKIT_API_KEY                                 | LiveKit API key                          |                                                                                                                                                               |
| LIVEKIT_API_SECRET                              | LiveKit API secret                       |                                                                                                                                                               |
| LIVEKIT_API_URL                                 | LiveKit API URL                          |                                                                                                                                                               |
| LIVEKIT_VERIFY_SSL                              | Verify SSL for LiveKit connections       | true                                                                                                                                                          |
| RESOURCE_DEFAULT_ACCESS_LEVEL                   | Default resource access level for rooms  | public                                                                                                                                                        |
| ALLOW_UNREGISTERED_ROOMS                        | Allow usage of unregistered rooms        | true                                                                                                                                                          |
| RECORDING_ENABLE                                | Record meeting option                    | false                                                                                                                                                         |
| RECORDING_OUTPUT_FOLDER                         | Folder to store meetings                 | recordings                                                                                                                                                    |
| RECORDING_WORKER_CLASSES                        | Worker classes for recording             | {"screen_recording": "core.recording.worker.services.VideoCompositeEgressService","transcript": "core.recording.worker.services.AudioCompositeEgressService"} |
| RECORDING_EVENT_PARSER_CLASS                    | Storage event engine for recording       | core.recording.event.parsers.MinioParser                                                                                                                      |
| RECORDING_ENABLE_STORAGE_EVENT_AUTH             | Enable storage event authorization       | true                                                                                                                                                          |
| RECORDING_STORAGE_EVENT_ENABLE                  | Enable recording storage events          | false                                                                                                                                                         |
| RECORDING_STORAGE_EVENT_TOKEN                   | Recording storage event token            |                                                                                                                                                               |
| RECORDING_EXPIRATION_DAYS                       | Recording expiration in days             |                                                                                                                                                               |
| SCREEN_RECORDING_BASE_URL                       | Screen recording base URL                |                                                                                                                                                               |
| SUMMARY_SERVICE_ENDPOINT                        | Summary service endpoint                 |                                                                                                                                                               |
| SUMMARY_SERVICE_API_TOKEN                       | API token for summary service            |                                                                                                                                                               |
| SIGNUP_NEW_USER_TO_MARKETING_EMAIL              | Signup users to marketing emails         | false                                                                                                                                                         |
| MARKETING_SERVICE_CLASS                         | Marketing service class                  | core.services.marketing.BrevoMarketingService                                                                                                                 |
| BREVO_API_KEY                                   | Brevo API key for marketing emails       |                                                                                                                                                               |
| BREVO_API_CONTACT_LIST_IDS                      | Brevo API contact list IDs               | []                                                                                                                                                            |
| DJANGO_BREVO_API_CONTACT_ATTRIBUTES             | Brevo contact attributes                 | {"VISIO_USER": true}                                                                                                                                          |
| BREVO_API_TIMEOUT                               | Brevo timeout in seconds                 | 1                                                                                                                                                             |
| LOBBY_KEY_PREFIX                                | Lobby key prefix                         | room_lobby                                                                                                                                                    |
| LOBBY_WAITING_TIMEOUT                           | Lobby waiting timeout in seconds         | 3                                                                                                                                                             |
| LOBBY_DENIED_TIMEOUT                            | Lobby deny timeout in seconds            | 5                                                                                                                                                             |
| LOBBY_ACCEPTED_TIMEOUT                          | Lobby accept timeout in seconds          | 21600 (6 hours)                                                                                                                                               |
| LOBBY_NOTIFICATION_TYPE                         | Lobby notification types                 | participantWaiting                                                                                                                                            |
| LOBBY_COOKIE_NAME                               | Lobby cookie name                        | lobbyParticipantId                                                                                                                                            |
| ROOM_CREATION_CALLBACK_CACHE_TIMEOUT            | Room creation callback cache timeout     | 600 (10 minutes)                                                                                                                                              |
| ROOM_TELEPHONY_ENABLED                          | Enable SIP telephony feature             | false                                                                                                                                                         |
| ROOM_TELEPHONY_PIN_LENGTH                       | Telephony PIN length                     | 10                                                                                                                                                            |
| ROOM_TELEPHONY_PIN_MAX_RETRIES                  | Telephony PIN maximum retries            | 5                                                                                                                                                             |
