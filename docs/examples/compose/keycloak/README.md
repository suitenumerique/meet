# Deploy and Configure Keycloak for Meet

## Installation

> [!CAUTION]
> We provide those instructions as an example, for production environments, you should follow the [official documentation](https://www.keycloak.org/documentation).

### Step 1: Prepare your working environment:

```bash
mkdir -p keycloak/env.d && cd keycloak
curl -o compose.yaml https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/docs/examples/compose/keycloak/compose.yaml
curl -o env.d/kc_postgresql https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/env.d/production.dist/kc_postgresql
curl -o env.d/keycloak https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main/env.d/production.dist/keycloak
```

### Step 2:. Update `env.d/` files

The following variables need to be updated with your own values, others can be left as is:

```env
POSTGRES_PASSWORD=<generate postgres password>
KC_HOSTNAME=https://id.yourdomain.tld # Change with your own URL
KC_BOOTSTRAP_ADMIN_PASSWORD=<generate your password>
```

### Step 3: Expose keycloak instance on https

> [!NOTE]
> You can skip this section if you already have your own setup.

To access your Keycloak instance on the public network, it needs to be exposed on a domain with SSL termination. You can use our [example with nginx proxy and Let's Encrypt companion](../nginx-proxy/README.md) for automated creation/renewal of certificates using [acme.sh](http://acme.sh).

If following our example, uncomment the environment and network sections in compose file and update it with your values.

```yaml
version: '3'
services:
  keycloak:
   ...
    # Uncomment and set your values if using our nginx proxy example
    # environment:
    # - VIRTUAL_HOST=id.yourdomain.tld # used by nginx proxy 
    # - VIRTUAL_PORT=8080 # used by nginx proxy
    # - LETSENCRYPT_HOST=id.yourdomain.tld # used by lets encrypt to generate TLS certificate
   ...
# Uncomment if using our nginx proxy example
#    networks:
#    - proxy-tier
#    - default

# Uncomment if using our nginx proxy example
#networks:
#  proxy-tier:
#    external: true
```

### Step 4: Start the service

```bash
`docker compose up -d`
```

Your keycloak instance is now available on https://doc.yourdomain.tld

> [!CAUTION]
> Version of the images are set to latest, you should pin it to the desired version to avoid unwanted upgrades when pulling latest image. You can find available versions on [Keycloak registry](https://quay.io/repository/keycloak/keycloak?tab=tags).
```

## Creating an OIDC Client for Meet Application

### Step 1: Create a New Realm

1. Log in to the Keycloak administration console.
2. Navigate to the realm tab and click on the "Create realm" button.
3. Enter the name of the realm  - `meet`.
4. Click "Create".

#### Step 2: Create a New Client

1. Navigate to the "Clients" tab.
2. Click on the "Create client" button.
3. Enter the client ID - e.g. `meet`.
4. Enable "Client authentication" option.
6. Set the "Valid redirect URIs" to the URL of your meet application suffixed with `/*` - e.g., "https://meet.example.com/*".
1. Set the "Web Origins" to the URL of your meet application - e.g. `https://meet.example.com`.
1. Click "Save".

#### Step 3: Get Client Credentials

1. Go to the "Credentials" tab.
2. Copy the client ID (`meet` in this example) and the client secret.
