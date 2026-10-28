# Reverse Proxy

Meet needs a reverse proxy: the one server that receives all HTTPS traffic, holds the TLS certificates and passes each request to the right container. Bring your own and check the routing table, or set up [nginx-proxy or Traefik](#nginx-proxy-or-traefik).

## What the proxy must route

| Hostname | Forward to | Notes |
|---|---|---|
| `meet.example.com` | `frontend`, port 8083 | Its nginx, [`nginx-routing.conf`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/nginx-routing.conf), sends `/api`, `/admin`, `/static`, `/external-api`, `/__heartbeat__` and `/__lbheartbeat__` to the backend, the rest to the web app |
| `livekit.example.com` | `livekit`, port 7880 | A WebSocket: pass the `Upgrade` header |
| `auth.example.com` | `keycloak`, port 8080 | Only if you run the Keycloak stack |

A proxy running outside Docker cannot reach the containers by name. Publish each port on the loopback interface and forward to `127.0.0.1`: `ports: ["127.0.0.1:8083:8083"]` on `frontend`, `"127.0.0.1:7880:7880"` on `livekit` and `"127.0.0.1:8080:8080"` on `keycloak`.

LiveKit media stays off the proxy: it is published straight on the host, see [Firewall & Ports](../configuration/firewall.md).

---

## nginx-proxy or Traefik

Either runs as its own stack on the `proxy` network, routes every container that opts in, and obtains a Let's Encrypt certificate for each:

- nginx-proxy + acme-companion find those containers by a `VIRTUAL_HOST` variable.
- Traefik finds them by `traefik.enable=true` labels.

!!! warning
    Both mount the Docker socket read-only to discover containers. To restrict that access, see their own documentation: [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy/tree/main/docs) and [acme-companion](https://github.com/nginx-proxy/acme-companion/tree/main/docs), or [Traefik](https://doc.traefik.io/traefik/).

### Step 1: Set up the proxy

The `proxy` network must exist first, see [Before you start](deployment-guide.md#before-you-start-configure-your-domains).

=== "nginx-proxy"

    ```bash
    mkdir -p ~/docker/nginx-proxy && cd ~/docker/nginx-proxy

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL -o compose.yml  ${RAW}/docs/examples/nginx-proxy/compose.yml
    cp ~/docker/hosts .env
    ```

=== "Traefik"

    ```bash
    mkdir -p ~/docker/traefik && cd ~/docker/traefik
    touch acme.json && chmod 600 acme.json

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL -o compose.yml  ${RAW}/docs/examples/traefik/compose.yml
    cp ~/docker/hosts .env
    ```

    `acme.json` stores Let's Encrypt certificates. It must exist with mode `600` before Traefik starts: Traefik does not use it with any other permission.

```bash
docker compose up -d
```

---

### Step 2: Meet's stacks opt in

Each stack's `docker-compose.override.yml`, downloaded in the Deployment Guide, opts its services in: you do not edit it. With a Traefik of your own, the overrides expect an entrypoint named `websecure` and a certificate resolver named `letsencrypt`.

Once every stack runs, check the certificates as in the Deployment Guide's [Verify](deployment-guide.md#verify) step.

---

## Next

Continue with the Deployment Guide's [Stack 2: Identity provider](deployment-guide.md#stack-2-identity-provider). If a hostname does not answer, see [Reverse proxy issues](../../reference/troubleshooting.md#reverse-proxy-issues).
