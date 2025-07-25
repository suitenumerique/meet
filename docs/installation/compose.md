# Installation with docker compose

We provide a sample configuration for running Meet using Docker Compose. Please note that this configuration is experimental, and the official way to deploy Meet in production is to use [k8s](../installation/k8s.md)

## Requirements

All services are required to run the minimalist instance of LaSuite Meet. Click the links for ready-to-use configuration examples:

| Service           | Purpose | Example Config                                           |
|-------------------|---------|----------------------------------------------------------|
| **PostgreSQL**    | Main database | [compose.yaml](../examples/compose/compose.yaml)         |
| **Redis**         | Cache & sessions | [compose.yaml](../examples/compose/compose.yaml)         |
| **Livekit**       | Real-time communication | [compose.yaml](../examples/compose/compose.yaml)         |
| **OIDC Provider** | User authentication | [Keycloak setup](../examples/compose/keycloak/README.md) |
| **SMTP Service**  | Email notifications | -                                                        |

> [!NOTE] Some advanced features, as Recording and transcription, require additional services (MinIO, email). See `/features` folder for details.


## Software Requirements

Ensure you have Docker Compose(v2) installed on your host server. Follow the official guidelines for a reliable setup:

Docker Compose is included with Docker Engine:

- **Docker Engine:** We suggest adhering to the instructions provided by Docker
  for [installing Docker Engine](https://docs.docker.com/engine/install/).

For older versions of Docker Engine that do not include Docker Compose:

- **Docker Compose:** Install it as per the [official documentation](https://docs.docker.com/compose/install/).

> [!NOTE]
> `docker-compose` may not be supported. You are advised to use `docker compose` instead.

## Step 1: Prepare your working environment:

```bash
mkdir -p meet/env.d && cd meet
curl -o compose.yaml https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/docs/examples/compose/compose.yaml
curl -o .env https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/env.d/production.dist/hosts
curl -o env.d/common https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/env.d/production.dist/common
curl -o env.d/postgresql https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/env.d/production.dist/postgresql
curl -o livekit-server.yaml https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/docs/examples/livekit/server.yaml
curl -o default.conf.template https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/docker/files/production/default.conf.template
```

## Step 2: Configuration

Meet configuration is achieved through environment variables. We provide a [detailed description of all variables](../env.md).

In this example, we assume the following services:

- OIDC provider on https://id.yourdomain.tld
- Livekit server on https://livekit.yourdomain.tld
- Meet server on https://meet.yourdomain.tld

**Set your own values in `.env`**

### OIDC

Authentication in Meet is managed through Open ID Connect protocol. A functional Identity Provider implementing this protocol is required.

For guidance, refer to our [Keycloak deployment example](../examples/compose/keycloak/README.md).

If using Keycloak as your Identity Provider, in `env.d/common` set `OIDC_RP_CLIENT_ID` and `OIDC_RP_CLIENT_SECRET` variables with those of the OIDC client created for Meet. By default we have set `meet` as the realm name, if you have named your realm differently, update the value `REALM_NAME` in `.env`

For others OIDC providers, update the variables in `env.d/common`.

### Postgresql

Meet uses PostgreSQL as its database. Although an external PostgreSQL can be used, our example provides a deployment method.

If you are using the example provided, you need to generate a secure key for `DB_PASSWORD` and set it in `env.d/postgresql`. 

If you are using an external service or not using our default values, you should update the variables in `env.d/postgresql`

### Redis

Meet uses Redis for caching and inter-service communication. While an external Redis can be used, our example provides a deployment method.

If you are using an external service, you need to set `REDIS_URL` environment variable in `env.d/common`.

### Livekit

[LiveKit](https://github.com/livekit/livekit) server is used as the WebRTC SFU (Selective Forwarding Unit) allowing multi-user conferencing. For more information, head to [livekit documentation](https://docs.livekit.io/home/self-hosting/).

Generate a secure key for `LIVEKIT_API_SECRET` in `env.d/common`.

We provide a minimal recommanded config for production environment in `livekit-server.yaml`. Set the previously generated API secret key in the config file.

To view other customization options, see [config-sample.yaml](https://github.com/livekit/livekit/blob/master/config-sample.yaml)

> [!NOTE]
> In this example, we configured multiplexing on a single UDP port. For better performances, you can configure a range of UDP ports. 

### Meet

The Meet backend is built on the Django Framework.

Generate a [secure key](https://docs.djangoproject.com/en/5.2/ref/settings/#secret-key.) for `DJANGO_SECRET_KEY` in `env.d/common`. 

### Mail

The following environment variables are required in `env.d/common` for the mail service to send invitations :

```env
DJANGO_EMAIL_HOST=<smtp host> 
DJANGO_EMAIL_HOST_USER=<smtp user> 
DJANGO_EMAIL_HOST_PASSWORD=<smtp password>
DJANGO_EMAIL_PORT=<smtp port> 
DJANGO_EMAIL_FROM=<your email address>

#DJANGO_EMAIL_USE_TLS=true # A flag to enable or disable TLS for email sending.
#DJANGO_EMAIL_USE_SSL=true # A flag to enable or disable SSL for email sending.


DJANGO_EMAIL_BRAND_NAME=<brand name used in email templates> # e.g. "La Suite Numérique"
DJANGO_EMAIL_LOGO_IMG=<logo image to use in email templates.> # e.g. "https://meet.yourdomain.tld/assets/logo-suite-numerique.png" 
```

## Step 3: Configure your firewall

If you are using a firewall as it is usually recommended in a production environment you will need to allow the webservice traffic on ports 80 and 443 but also to allow UDP traffic for the WebRTC service.

The following ports will need to be opened:
- 80/tcp - for TLS issuance
- 443/tcp - for listening on HTTPS and TURN/TLS packets
- 7881/tcp - WebRTC ICE over TCP
- 7882/udp - for WebRTC multiplexing over UDP

If you are using ufw, enter the follwoing:
```
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw enable
``` 

## Step 4: Reverse proxy and SSL/TLS

> [!WARNING]
> In a production environment, configure SSL/TLS termination to run your instance on https.

If you have your own certificates and proxy setup, you can skip this part.

You can follow our [nginx proxy example](../examples/compose/nginx-proxy/README.md) with automatic generation and renewal of certificate with Let's Encrypt. 

You will need to uncomment the environment and network sections in compose file and update it with your values.

```yaml
  frontend:
    ...
    # Uncomment and set your values if using our nginx proxy example
    # environment:
    # - VIRTUAL_HOST=${MEET_HOST} # used by nginx proxy 
    # - VIRTUAL_PORT=8083 # used by nginx proxy
    # - LETSENCRYPT_HOST=${MEET_HOST} # used by lets encrypt to generate TLS certificate
    ...
# Uncomment if using our nginx proxy example
#    networks:
#    - proxy-tier
#    - default
...
    # environment:
    # - VIRTUAL_HOST=${LIVEKIT_HOST} # used by nginx proxy 
    # - VIRTUAL_PORT=7880 # used by nginx proxy
    # - LETSENCRYPT_HOST=${LIVEKIT_HOST} # used by lets encrypt to generate TLS certificate
# Uncomment if using our nginx proxy example
#    networks:
#    - proxy-tier
#    - default
#networks:
#  proxy-tier:
#    external: true
```

## Step 5: Start Meet

You are ready to start your Meet application !

```bash
docker compose up -d
```
> [!NOTE]
> Version of the images are set to latest, you should pin it to the desired version to avoid unwanted upgrades when pulling latest image.

## Step 6: Run the database migration and create Django admin user

```bash
docker compose run --rm backend python manage.py migrate
docker compose run --rm backend python manage.py createsuperuser --email <admin email> --password <admin password>
```

Replace `<admin email>` with the email of your admin user and generate a secure password. 

Your Meet instance is now available on the domain you defined, https://meet.yourdomain.tld.

THe admin interface is available on https://meet.yourdomain.tld/admin with the admin user you just created.

## How to upgrade your Meet application

Before running an upgrade you must check the [Upgrade document](../../UPGRADE.md) for specific procedures that might be needed.

You can also check the [Changelog](../../CHANGELOG.md) for brief summary of the changes.

### Step 1: Edit the images tag with the desired version

### Step 2: Pull the images

```bash
docker compose pull
```

### Step 3: Restart your containers

```bash
docker compose restart
```

### Step 4: Run the database migration
Your database schema may need to be updated, run:
```bash
docker compose run --rm backend python manage.py migrate
```
