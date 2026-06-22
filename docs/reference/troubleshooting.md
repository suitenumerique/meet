# Troubleshooting

## Diagnostic checklist

Before investigating specific symptoms, collect basic information:

```bash
# Are all containers running?
docker compose ps

# Recent logs per service
docker compose logs --tail=50 backend
docker compose logs --tail=50 frontend
docker compose logs --tail=50 livekit
docker compose logs --tail=50 keycloak
```


## Application issues

### App returns 404 on all routes

**Cause**: `DJANGO_SETTINGS_MODULE` is not set in `.env`.

**Fix**: Add `DJANGO_SETTINGS_MODULE=meet.settings` to `.env` and restart.


### 502 Bad Gateway on all routes

**Cause**: The `frontend` container nginx is not listening on port 8083, or the backend is unreachable.

**Steps**:
1. Check `docker compose logs frontend` for nginx errors
2. Verify `nginx-routing.conf` is mounted to `/etc/nginx/conf.d/routing.conf:ro` in the frontend container
3. Verify the backend is running: `docker compose ps backend`


### API returns 301 in a loop / site keeps loading

**Cause**: Django's `SECURE_SSL_REDIRECT` is active and the nginx routing config is forwarding HTTP instead of HTTPS to the backend.

**Fix**: In the nginx routing template, the backend proxy location must hardcode the proto header:
```nginx
proxy_set_header X-Forwarded-Proto https;  # NOT $scheme
```
Then restart the frontend container.


### Login redirects but loops back to login page

**Cause A**: OIDC redirect URI mismatch.

Meet's callback URL is `https://meet.example.com/api/v1.0/callback/`, **not** the standard `/oidc/callback/`. Update your OIDC provider's client configuration to use the correct URI (including the trailing slash).

**Cause B**: Backend cannot reach Keycloak for token exchange.

The backend must be on the `proxy` Docker network to resolve public hostnames like `auth.example.com`. Check your compose file: the backend service should list both `proxy` and `internal` in its `networks:`.

**Cause C**: Session cookie mismatch. `DJANGO_CSRF_TRUSTED_ORIGINS` does not include your full HTTPS domain.


### "Invalid parameter: redirect_uri" from Keycloak

The redirect URI must be exactly `https://meet.example.com/api/v1.0/callback/` (note the versioned path and trailing slash). 

If using Keycloak, fix it in  admin console: Clients → meet → Settings → Valid redirect URIs.

## Audio/Video issues

### Disconnected from meeting immediately / "You left the meeting"

**Most likely cause**: LiveKit WebSocket is unreachable from the browser.

The browser connects to the URL returned by `GET /api/v1.0/rooms/{id}/token/`. If `LIVEKIT_API_URL` is set to the Docker-internal address (`http://livekit:7880`), browsers receive that address and can't connect.

**Fix**: `LIVEKIT_API_URL` must be the public HTTPS URL:
```dotenv
LIVEKIT_API_URL=https://livekit.example.com
```

Verify the LiveKit subdomain is accessible:
```bash
curl -s -o /dev/null -w "%{http_code}" https://livekit.example.com/
# Expected: 200
```


### Can join the room but no audio/video

**Cause**: UDP port 7882 is blocked.

LiveKit falls back to TCP (port 7881) when UDP is unavailable, which increases latency significantly. Verify:
1. Port 7882/UDP is open in your cloud provider's firewall (security group / network rules)
2. Port 7881/TCP is also open for TCP fallback


### Audio works but video is very pixelated or choppy

**Cause**: Network congestion or insufficient server bandwidth.

LiveKit's simulcast should adapt automatically. If it doesn't:
1. Check server bandwidth; LiveKit forwards all streams through the server
2. Have participants check their own connection speed
3. Review LiveKit metrics

## Recording issues

### Recording button is missing

Recording requires explicit activation and S3 storage to be configured. Ensure the following env vars are set:
- `RECORDING_ENABLE=True`
- `AWS_S3_ENDPOINT_URL`
- `AWS_S3_ACCESS_KEY_ID`
- `AWS_S3_SECRET_ACCESS_KEY`
- `AWS_STORAGE_BUCKET_NAME`

Verify via the API: `curl https://meet.example.com/api/v1.0/config/ | jq .recording.is_enabled` should return `true`.


### Recording button clicked but UI stays on "starting"

**Cause**: The backend never receives the LiveKit webhook that signals recording has started or stopped. This is almost always a `DJANGO_ALLOWED_HOSTS` issue combined with Django's HTTP-to-HTTPS redirect.

When LiveKit sends webhooks to `http://backend:8000/...` (internal Docker URL), Django's `SecurityMiddleware` redirects HTTP to HTTPS, and the request fails. When the Host header is not in `ALLOWED_HOSTS`, Django returns 400.

**Fix**:

1. In your `.env`, ensure `DJANGO_ALLOWED_HOSTS` includes the internal service names:
   ```dotenv
   DJANGO_ALLOWED_HOSTS=meet.example.com,backend,localhost
   ```

2. In `livekit-server.yaml`, configure the webhook to use the **public HTTPS URL**, not the internal Docker address:
   ```yaml
   webhook:
     api_key: meet
     urls:
       - https://meet.example.com/api/v1.0/rooms/webhooks-livekit/
   ```

3. In `compose.yml`, add the `livekit` service to the `proxy` network so it can resolve the public domain name internally.

4. Recreate the affected containers:
   ```bash
   docker compose up -d backend livekit
   ```

Check that webhooks are now arriving with `docker compose logs backend | grep webhooks-livekit`.


### Recording fails immediately / "no response from servers"

**Cause**: LiveKit Egress refuses to start because the server reports fewer available CPUs than the default `room_composite_cpu_cost` of 4.0. This is common on VPS and shared hosting.

**Fix**: Add CPU cost overrides to `livekit-egress.yaml`:
```yaml
cpu_cost:
  room_composite_cpu_cost: 1.5
  track_composite_cpu_cost: 1.0
  track_cpu_cost: 0.5
```
Restart the egress container: `docker compose restart livekit-egress`


### Recording starts but file never appears

1. Check Egress logs: `docker compose logs livekit-egress`
2. Check your bucket
3. Check webhook delivery: `docker compose logs backend | grep storage-hook`


### Recording download link shows "Verify your meeting code"

**Cause A**: `RECORDING_DOWNLOAD_BASE_URL` is set to the bare domain instead of including the `/recording` path.

The email notification link is constructed as `{RECORDING_DOWNLOAD_BASE_URL}/{recording-id}`. The frontend route for recording pages is `/recording/<uuid>`, not `/<uuid>`. Using the bare domain sends users to a page that interprets the UUID as a room code.

**Fix**: Set `RECORDING_DOWNLOAD_BASE_URL` with the `/recording` path:
```dotenv
RECORDING_DOWNLOAD_BASE_URL=https://meet.example.com/recording
```
Then recreate the backend: `docker compose up -d --force-recreate backend celery`

**Cause B**: The `/media/` location is missing from the nginx routing template.

The download button on the recording page links to `https://meet.example.com/media/recordings/<uuid>.mp4`. Without a routing rule, this falls through to the React frontend which shows "Verify your meeting code".

**Fix**: Add a MinIO proxy to the template; see [Reverse Proxy & Routing](../self-hosting/compose/nginx.md) for the full config with recording support. Restart the frontend after updating: `docker compose restart frontend`


## Traefik issues

### Traefik refuses to start

**Cause**: `acme.json` has wrong permissions or does not exist.

```bash
ls -la ~/docker/traefik/acme.json
# Must show: -rw------- (600)
```

**Fix**:
```bash
touch ~/docker/traefik/acme.json
chmod 600 ~/docker/traefik/acme.json
docker compose restart traefik
```


### Service returns 502 / Traefik can't reach a container

**Cause**: The container is not on the `proxy` Docker network, which Traefik uses for backend connections.

**Fix**: Ensure the service has `proxy` in its `networks:` list:
```yaml
networks:
  - proxy
  - internal
```
Then recreate: `docker compose up -d --force-recreate <service>`


### Route not appearing / service returns 404

**Cause**: `traefik.enable=true` label is missing.

Since `--providers.docker.exposedByDefault=false` is set, containers must explicitly opt in. Add the label and recreate the container:
```bash
docker compose up -d --force-recreate <service>
```


### TLS certificate not being issued

1. Verify port 80 is publicly reachable (required for the HTTP-01 ACME challenge)
2. Verify DNS resolves to this server before Traefik starts
3. Check certificate logs: `docker logs traefik | grep -i "acme\|certificate\|error"`


### Port conflict on 80 or 443

Another process (nginx-proxy, Apache, etc.) is already bound to the port. Stop it before starting Traefik:
```bash
docker ps | grep -E "0.0.0.0:80|0.0.0.0:443"
```


## Docker and container issues

### Container keeps restarting

```bash
docker compose logs --tail=30 <service>
```

Common causes:
- Missing required environment variable (check for `ImproperlyConfigured` errors)
- Port already in use on the host
- Permission error on a mounted volume


### Out of disk space

```bash
df -h

# Clean unused Docker resources
docker system prune -f
docker volume prune -f  # WARNING: removes unused volumes
```


## Getting more help

1. **Search existing issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
2. **Matrix community**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
3. **Open a new issue**: include your Meet version, deployment method, and relevant logs
