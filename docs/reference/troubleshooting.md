# Troubleshooting

## Diagnostic checklist

Collect this before looking up a symptom:

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

### Backend runs the Development configuration, or fails at start

The proxy returns 502 while the backend is down.

**Cause**: `DJANGO_CONFIGURATION` is not set: `wsgi.py`, `manage.py` and the Celery app then fall back to `Development`, which needs development-only packages the published image does not include.

**Fix**: Set `DJANGO_SETTINGS_MODULE=meet.settings` and `DJANGO_CONFIGURATION=Production` in `env.d/common` and recreate the backend.


### 502 Bad Gateway on all routes

**Cause**: The nginx in the `frontend` container is not listening on port 8083, or the backend is unreachable.

**Fix**:
1. Check `docker compose logs frontend` for nginx errors
2. Verify `nginx-routing.conf` is mounted to `/etc/nginx/conf.d/routing.conf:ro` in the frontend container
3. Verify the backend is running: `docker compose ps backend`


### API returns 301 in a loop / site keeps loading

**Cause**: Django's `SECURE_SSL_REDIRECT` is on, and the routing nginx tells the backend the request came over HTTP, so Django redirects it to HTTPS again.

**Fix**: In `nginx-routing.conf`, the backend proxy location must hardcode the proto header:
```nginx
proxy_set_header X-Forwarded-Proto https;  # NOT $scheme
```
Then restart the frontend container: `docker compose restart frontend`.


## Login issues

### Login redirects but loops back, or the provider says `Invalid parameter: redirect_uri`

**Cause A**: The redirect URI registered at your OIDC provider is not exactly `https://meet.example.com/api/v1.0/callback/`, with the versioned path and the trailing slash. On Keycloak, fix it under Clients → meet → Settings → Valid redirect URIs.

**Cause B**: The backend cannot reach the provider for the token exchange: wrong `OIDC_OP_*` URLs, or the provider is down. Check from `~/docker/meet`; it must print `200`:
```bash
docker compose exec backend python -c "import urllib.request; print(urllib.request.urlopen('https://auth.example.com/realms/meet').status)"
```

**Cause C**: `OIDC_RP_CLIENT_SECRET` does not match the client's secret at the provider; the backend log then shows the token exchange refused.

## Audio/Video issues

### Disconnected from meeting immediately / "You left the meeting"

**Cause**, most often: `LIVEKIT_API_URL` is the Docker-internal address, `http://livekit:7880`. The backend hands that URL to browsers in `GET /api/v1.0/rooms/{id}/`, and they cannot reach it.

**Fix**: `LIVEKIT_API_URL` must be the public HTTPS URL:
```dotenv
LIVEKIT_API_URL=https://livekit.example.com
```

Check that the LiveKit subdomain responds:
```bash
curl -s -o /dev/null -w "%{http_code}" https://livekit.example.com/
# Expected: a status code below 400
```


### Can join the room but no audio/video

**Cause**: The participant's network, or your server's firewall, blocks both 7882/UDP and 7881/TCP. With only UDP blocked, media still flows over TCP, with more latency.

**Fix**: Open both in your cloud provider's security group, see [Firewall & Ports](../self-hosting/configuration/firewall.md). For participants on networks that block them, enable [TURN](../self-hosting/configuration/livekit.md#turn).

### TURN is enabled but does not relay

**Cause A**: The `domain` of the `turn:` block is not the LiveKit subdomain, `livekit.example.com`.

**Cause B**: Another process holds 443/UDP, so LiveKit cannot listen there. On the server, `ss -ulpn | grep ':443 '` names it.

**Cause C**, with TURN over TLS: the LiveKit log shows `failed to load certificate`. `cert_file` and `key_file` are paths inside the container; check the mount reaches them:

```bash
docker compose exec livekit ls -l /certs/
```

### Audio works but video is very pixelated or choppy

**Cause**: Too little bandwidth. LiveKit lowers the quality it forwards to a receiver whose connection cannot hold more.

**Fix**: Lasting pixelation means the sender's upload or the server's bandwidth is too low, since every stream passes through the server. Give the server more bandwidth, or have the sender use a better connection.

## Recording issues

### Recording button is missing

The button shows only when all of these hold:

- `RECORDING_ENABLE=True` on the backend; `curl https://meet.example.com/api/v1.0/config/ | jq .recording.is_enabled` must print `true`.
- You may record in this room, as [Who can record](../self-hosting/configuration/recording.md#who-can-record) lists. Anyone else sees **Record** under **More tools** with a **Request** button.
- Where frontend analytics is configured, the PostHog feature flag for recording is on for you.

The storage variables do not affect the button; they decide whether the file is saved, see [Recording starts but file never appears](#recording-starts-but-file-never-appears).


### Recording button clicked but UI stays on "starting"

**Cause**: The backend never receives LiveKit's webhook, and the recording leaves "starting" only when an `egress_updated` event arrives.

**Fix**: Check the [`webhook:` block](../self-hosting/configuration/livekit.md#webhook) of `livekit-server.yaml`, which the base install writes:

- its URL is the **public HTTPS** address, `https://meet.example.com/api/v1.0/rooms/webhooks-livekit/`, not an internal one such as `http://backend:8000/...`, which the Production configuration refuses (an HTTPS redirect, or 400 when that host is not in `DJANGO_ALLOWED_HOSTS`);
- its `api_key` equals `LIVEKIT_API_KEY`.

Then recreate LiveKit, `docker compose up -d livekit`, and watch the requests arrive with `docker compose logs -f backend | grep webhooks-livekit`; each one should get a `200` response.


### Recording fails immediately / "no response from servers"

**Cause**: LiveKit Egress refuses to start: the server reports fewer CPUs than the default `room_composite_cpu_cost`, the CPU Egress reserves for a room recording. This is common on a VPS or shared hosting.

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
3. Check that LiveKit's webhook reaches the backend, since its `egress_ended` event finalizes the recording: `docker compose logs backend | grep webhooks-livekit`


### Recording download link shows "Verify your meeting code"

**Cause A**: `RECORDING_DOWNLOAD_BASE_URL` lacks the `/recording` path. The email links to `{RECORDING_DOWNLOAD_BASE_URL}/<uuid>`, so a bare domain sends users to `/<uuid>`, which the frontend reads as a room code.

**Fix**: Set `RECORDING_DOWNLOAD_BASE_URL` with the `/recording` path:
```dotenv
RECORDING_DOWNLOAD_BASE_URL=https://meet.example.com/recording
```
Then recreate the backend and Celery: `docker compose up -d --force-recreate backend celery`

**Cause B**: `nginx-routing.conf` has no `/media/` location, so the download button's `https://meet.example.com/media/recordings/<uuid>.mp4` falls through to the React frontend.

**Fix**: Add the object storage proxy to it; see [Recording](../self-hosting/configuration/recording.md#step-4-route-recording-downloads). Restart the frontend after updating: `docker compose restart frontend`


## Subtitles issues

### No captions appear

- Check that `ROOM_SUBTITLE_ENABLED=True` is set in the backend's environment.
- Check that the agent is running: `docker compose ps multi-user-transcriber`.
- Check the agent logs for connection errors: `docker compose logs multi-user-transcriber`.


### Captions are delayed or choppy

**Cause**: Network latency to a cloud STT provider such as Deepgram, or an agent short of CPU or memory.

**Fix**: Give the agent more CPU and memory, or pick a provider closer to the server, see [STT providers](../self-hosting/configuration/subtitles.md#stt-providers).


### Subtitles agent fails to start

**Cause**: A required environment variable is missing, an API key is invalid, or the agent cannot connect to the LiveKit server at `LIVEKIT_URL`.

**Fix**: Read `docker compose logs multi-user-transcriber`, then check the agent's variables against [Environment Variables: Agents](env-variables.md#agents).


## Telephony issues

### No audio from a phone participant

**Cause**: The RTP port range, 10000-20000/UDP, is blocked.

**Fix**: Open it, as [Firewall & Ports](../self-hosting/configuration/firewall.md) lists.


### SIP call fails to connect

**Cause**: The origination URI in your SIP provider's console does not point to your LiveKit SIP service on port 5060, or a firewall blocks 5060/UDP.

**Fix**: Point the origination URI at the SIP service on 5060, see [SIP provider setup](../self-hosting/configuration/telephony.md#sip-provider-setup-twilio-example), and open 5060/UDP.


### Calls are rejected: no dispatch rule matched

**Cause**: Meet creates a room's dispatch rule on the `room_started` webhook, sent when the first participant joins. Until then, or while the webhook does not reach the backend, the room has no rule.

**Fix**: Have someone join the room from a browser before phone participants dial in, and check the webhook arrives: `docker compose logs backend | grep webhooks-livekit`.


## Reverse proxy issues

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
docker restart traefik
```


### Service returns 502 / Traefik can't reach a container

**Cause**: The container is not on the `proxy` Docker network. Only the services with Traefik labels need it: `frontend`, `livekit` and `keycloak`. `backend` has no labels and is reached only through `frontend`.

**Fix**: Add `proxy` to the service's `networks:` list:
```yaml
networks:
  - proxy
  - internal
```
Then recreate: `docker compose up -d --force-recreate <service>`


### Route not appearing / service returns 404

**Cause**: The `traefik.enable=true` label is missing. Traefik runs with `--providers.docker.exposedByDefault=false`, so each container must opt in.

**Fix**: Add the label and recreate the container:
```bash
docker compose up -d --force-recreate <service>
```


### TLS certificate not being issued

1. Verify port 80 is publicly reachable (required for the HTTP-01 ACME challenge)
2. Verify DNS resolves to this server before the proxy starts
3. Check the certificate logs:
    - nginx-proxy: `docker compose -f ~/docker/nginx-proxy/compose.yml logs acme-companion`
    - Traefik: `docker logs traefik | grep -i "acme\|certificate\|error"`


### Port conflict on 80 or 443

**Cause**: Another process, another proxy or Apache for example, already holds the port.

**Fix**: Find it, and stop it before starting your proxy:
```bash
sudo ss -tlpn 'sport = :80 or sport = :443'
```


## Docker and container issues

### Container keeps restarting

```bash
docker compose logs --tail=30 <service>
```

Common causes:
- A required environment variable is missing; the log names it
- Port already in use on the host
- Permission error on a mounted volume


### Out of disk space

!!!warning
    `docker system prune` and `docker volume prune` act on the whole Docker host: every project's unused containers, images, volumes and networks go too. Drop `-f` to review the list before confirming.

```bash
df -h                    # how full each disk is
docker system prune -f   # removes unused Docker data, host-wide
docker volume prune -f   # removes unused volumes, other projects' included
```


## Getting more help

1. **Search existing issues**: [github.com/suitenumerique/meet/issues](https://github.com/suitenumerique/meet/issues)
2. **Matrix community**: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
3. **Open a new issue**: include your Meet version, deployment method, and relevant logs
