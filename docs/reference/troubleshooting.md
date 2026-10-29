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
docker compose -f ~/docker/keycloak/compose.yml logs --tail=50 keycloak
```

## Reverse proxy issues

### Traefik refuses to start

**Cause**: `acme.json` is missing, or `ls -la ~/docker/traefik/acme.json` does not show `-rw-------`, mode `600`.

**Fix**:
```bash
touch ~/docker/traefik/acme.json
chmod 600 ~/docker/traefik/acme.json
docker restart traefik
```

### Service returns 502 / Traefik can't reach a container

**Cause**: The container is not on the `proxy` Docker network, whose members [Docker networks](networking.md#docker-networks) lists.

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

1. Verify port 80 is publicly reachable: the HTTP-01 ACME challenge needs it
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

## Application issues

### Backend runs the Development configuration, or fails at start

The proxy returns 502 while the backend is down.

**Cause**: `DJANGO_CONFIGURATION` is not set, so the backend and its Celery worker fall back to `Development`, which needs development-only packages the published image does not include.

**Fix**: Set `DJANGO_CONFIGURATION=Production` in `env.d/common` and recreate the backend.

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

**Cause A**: The redirect URI registered at your [OIDC](https://openid.net/developers/how-connect-works/) provider differs from the one [Client configuration](../self-hosting/configuration/sso.md#client-configuration) gives, trailing slash included. On Keycloak, fix it under Clients → meet → Settings → Valid redirect URIs.

**Cause B**: The backend cannot reach the provider for the token exchange: wrong `OIDC_OP_*` URLs, or the provider is down. Check from `~/docker/meet`:

```console
$ IDP=https://auth.example.com/realms/meet
$ PY="import urllib.request as u; print(u.urlopen('$IDP').status)"
$ docker compose exec backend python -c "$PY"
200
```

**Cause C**: `OIDC_RP_CLIENT_SECRET` does not match the client's secret at the provider; the backend log then shows the token exchange refused.

## Audio/Video issues

### Disconnected from meeting immediately / "You have left the meeting"

**Cause**, most often: [`LIVEKIT_API_URL`](env-variables.md#LIVEKIT_API_URL) is the Docker-internal address, `http://livekit:7880`, which browsers cannot reach.

**Fix**: Set it to the public HTTPS URL:
```dotenv
LIVEKIT_API_URL=https://livekit.example.com
```

Check that the LiveKit subdomain responds; any status below 400 is fine:

```console
$ curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
200
```

### Can join the room but no audio/video

**Cause**: The participant's network, or your server's firewall, blocks every media path that [How media connects](../self-hosting/configuration/livekit.md#how-media-connects) lists.

**Fix**: Open the media ports, 7882/UDP and 7881/TCP, in your cloud provider's security group, as [Firewall & Ports](../self-hosting/configuration/firewall.md#ports-to-open) lists. For participants on networks that block them, enable [TURN](../self-hosting/configuration/livekit.md#turn).

### TURN is enabled but does not relay

**Cause A**: The `domain` of the `turn:` block is not the LiveKit subdomain, `livekit.example.com`.

**Cause B**: Another process holds 443/UDP, so LiveKit cannot listen there. On the server, `ss -ulpn | grep ':443 '` names it.

**Cause C**, with TURN over TLS: the LiveKit log shows `failed to load certificate`. `cert_file` and `key_file` are paths inside the container; check the mount reaches them:

```bash
docker compose exec livekit ls -l /certs/
```

### Audio works but video is very pixelated or choppy

**Cause**: The sender's upload or the server's bandwidth is too low. Every stream passes through the server, and LiveKit lowers the quality it forwards to a receiver whose connection cannot hold more.

**Fix**: Give the server more bandwidth, or have the sender use a better connection.

## Recording issues

### Recording button is missing

The button shows only when all of these hold:

- `RECORDING_ENABLE=True` on the backend. Check it, with [jq](https://jqlang.org/):

    ```console
    $ curl -s https://meet.example.com/api/v1.0/config/ | jq .recording.is_enabled
    true
    ```

- You may record in this room, as [Who can record](../self-hosting/configuration/recording.md#who-can-record) lists. Anyone else sees **Record** under **More tools** with a **Request** button.
- Where frontend analytics is configured, the PostHog feature flag for recording is on for you.

The storage variables do not affect the button; they decide whether the file is saved, see [Recording starts but file never appears](#recording-starts-but-file-never-appears).

### Recording button clicked but UI stays on "starting"

**Cause**: The backend never receives LiveKit's webhook, and the recording leaves "starting" only when an `egress_updated` event arrives.

**Fix**: Check the [`webhook:` block](../self-hosting/configuration/livekit.md#webhook) of `livekit-server.yaml`, which the base install writes:

- its URL is the **public HTTPS** address `https://meet.example.com/api/v1.0/rooms/webhooks-livekit/`, never an internal one such as `http://backend:8000/...`, which the Production configuration refuses;
- its `api_key` equals [`LIVEKIT_API_KEY`](env-variables.md#LIVEKIT_API_KEY).

Then recreate LiveKit, `docker compose up -d livekit`, and watch the requests arrive with `docker compose logs -f backend | grep webhooks-livekit`; each one should get a `200` response.

### Recording fails immediately / "no response from servers"

**Cause**: LiveKit Egress refuses to start: the server reports fewer CPUs than the default `room_composite_cpu_cost`, the CPU Egress reserves for a room recording. This is common on a VPS or shared hosting.

**Fix**: Add the `cpu_cost` block of [Step 2: LiveKit Egress](../self-hosting/configuration/recording.md#step-2-livekit-egress) to `livekit-egress.yaml`, then restart the egress container: `docker compose restart livekit-egress`

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

**Cause**: A firewall blocks 10000-20000/UDP, the phone audio ports of [Firewall & Ports](../self-hosting/configuration/firewall.md#ports-to-open).

**Fix**: Open them.

### SIP call fails to connect

**Cause**: The origination URI in your SIP provider's console does not point to your LiveKit SIP service, or a firewall blocks its SIP port, which [Firewall & Ports](../self-hosting/configuration/firewall.md#ports-to-open) lists.

**Fix**: Point the origination URI at the SIP service on 5060, see [SIP provider setup](../self-hosting/configuration/telephony.md#sip-provider-setup-twilio-example), and open 5060/UDP.

### Calls are rejected: no dispatch rule matched

**Cause**: A room has no dispatch rule until its first browser participant joins, as [How do phone calls join?](../overview/how-meet-works.md#agents-and-phone-calls) explains. It also has none while LiveKit's webhook does not reach the backend.

**Fix**: Have someone join the room from a browser before phone participants dial in, and check the webhook arrives: `docker compose logs backend | grep webhooks-livekit`.

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

!!! warning
    `docker system prune` and `docker volume prune` act on the whole Docker host: every project's unused containers, images, networks and anonymous volumes go too. Each lists what it removes and asks before deleting.

```bash
# How full each disk is
df -h

# Unused Docker data, host-wide; each asks before deleting
docker system prune
docker volume prune
```

## Getting more help

Search the [existing issues](https://github.com/suitenumerique/meet/issues) first, or ask the community, see [Community and support](../index.md#community-and-support). A new issue needs your Meet version, your deployment method and the relevant logs.
