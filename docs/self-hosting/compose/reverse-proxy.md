# Reverse Proxy

A [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy) receives your domains' HTTPS traffic and passes each request to the right container.

Bring your own and check the routing table, or set up [nginx-proxy or Traefik](#nginx-proxy-or-traefik).

## What the proxy must route

| Hostname | Forward to | Notes |
|---|---|---|
| `meet.example.com` | `frontend`, port 8083 | Its [nginx](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/nginx-routing.conf) sends `/api`, `/admin`, `/static`, `/external-api`, `/__heartbeat__` and `/__lbheartbeat__` to the backend |
| `livekit.example.com` | `livekit`, port 7880 | WebSocket: pass the `Upgrade` header |
| `auth.example.com` | `keycloak`, port 8080 | With the Keycloak stack only |

A proxy outside Docker cannot reach the containers by name: publish each port of the table on `127.0.0.1`, such as `ports: ["127.0.0.1:8083:8083"]` on `frontend`, and forward there.

LiveKit's media ports bypass the proxy, see [Firewall & Ports](../configuration/firewall.md).

## nginx-proxy or Traefik

Each of these two runs as a small Docker stack of its own. You write no proxy configuration, since it:

- watches Docker;
- routes every Meet container that asks for it;
- gets a Let's Encrypt certificate for each hostname.

The Quick Start uses nginx-proxy.

!!! warning
    Both read the Docker socket to see the containers. To restrict that access, see [nginx-proxy: Separate Containers](https://github.com/nginx-proxy/nginx-proxy/tree/main/docs#separate-containers), [acme-companion](https://github.com/nginx-proxy/acme-companion/tree/main/docs) or [Traefik: Docker API Access](https://doc.traefik.io/traefik/reference/install-configuration/providers/docker/#docker-api-access).

### Step 1: Start the proxy

Create the shared `proxy` network first, as [Before you start](deployment-guide.md#before-you-start) shows. Then fetch the stack:

=== "nginx-proxy"

    ```bash
    mkdir -p ~/docker/nginx-proxy && cd ~/docker/nginx-proxy

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL -o compose.yml $RAW/docs/examples/nginx-proxy/compose.yml
    cp ~/docker/hosts .env
    ```

=== "Traefik"

    ```bash
    mkdir -p ~/docker/traefik && cd ~/docker/traefik
    touch acme.json && chmod 600 acme.json

    RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"

    curl -fsSL -o compose.yml $RAW/docs/examples/traefik/compose.yml
    cp ~/docker/hosts .env
    ```

    `acme.json` holds the certificates. Traefik refuses it unless its mode is `600`.

And start it:

```bash
docker compose up -d
```

### Step 2: Nothing to edit on Meet's side

Each Meet stack's `docker-compose.override.yml`, which the Deployment Guide downloads, asks the proxy to route it: a `VIRTUAL_HOST` variable for nginx-proxy, a `traefik.enable=true` label for Traefik.

!!! note "A Traefik of your own"
    Name its entrypoint `websecure` and its certificate resolver `letsencrypt`, as those files expect.

Once every stack runs, check the certificates as in the Deployment Guide's [Verify](deployment-guide.md#verify) step.

## Next

Continue with the Deployment Guide's [Stack 2: Identity provider](deployment-guide.md#stack-2-identity-provider). If a hostname does not answer, see [Reverse proxy issues](../../reference/troubleshooting.md#reverse-proxy-issues).
