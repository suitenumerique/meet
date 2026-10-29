# LiveKit & TURN

LiveKit is the media server: every participant sends it their audio and video, and it forwards each stream to the others. The [Deployment Guide](../compose/deployment-guide.md) sets it up from [`livekit-server.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/livekit-server.yaml), which works as shipped. [Firewall & Ports](firewall.md) lists the ports each choice opens.

## How media connects

LiveKit talks to a browser on two channels:

- **Signalling**, the control messages of the call: a WebSocket on 443 through your reverse proxy, which forwards it to LiveKit's port 7880. Port 7880 is [never public](firewall.md#never-public).
- **Media**, the audio and video themselves, straight between the browser and LiveKit, without the reverse proxy.

For media, the browser uses the best path its network allows, in this order of preference:

| Path | Port | Used when |
|---|---|---|
| Direct UDP | 7882/UDP | Always tried first, with the lowest latency |
| TCP | 7881/TCP | The network blocks 7882/UDP. Adds latency |
| TURN relay | 443/UDP, or TLS on 5349/TCP | The network blocks both. Off until you [enable TURN](#turn) |

A participant whose network allows none of these still joins, since signalling works, but gets no audio or video. If a phone hotspot fixes it, their network blocks the media ports.

## The media port

`udp_port: 7882` in `livekit-server.yaml` sends every participant's media through that one UDP port. The other form is a wide port range. Set one, never both: once a range is set, `udp_port` has no effect.

=== "One port, or a few (default)"

    ```yaml
    rtc:
      tcp_port: 7881
      udp_port: 7882        # or a small range, e.g. 7882-7885
      use_external_ip: true
    ```

    For performance, LiveKit recommends at least one port per CPU core. Publish and open every port of the range.

=== "A wide range"

    ```yaml
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true
    ```

    LiveKit gives each connection its own port from the range. A range opens far more ports to the internet, so use it only when several LiveKit processes share one host. In `compose.yml`, replace `"7882:7882/udp"` with `"50000-60000:50000-60000/udp"`.

On Kubernetes, the chart serves the media ports from the node itself, see [Helm: LiveKit media ports](../kubernetes/helm.md#livekit-media-ports).

## `use_external_ip`

`use_external_ip: true`, set in the example file, makes LiveKit learn its public IP at startup from a public [STUN](../../overview/how-meet-works.md#key-concepts) server, and announce it to browsers. A host whose public IP is not on its network interface needs it: AWS, GCP, Azure, any host behind NAT. Elsewhere it does no harm.

Unless `stun_servers` under `rtc:` names others, LiveKit [asks](https://github.com/livekit/mediatransportutil/blob/master/pkg/rtcconfig/ip.go#L35-L40) Twilio's and Google's STUN servers, so the server needs outbound UDP to `global.stun.twilio.com:3478` and `stun.l.google.com:19302`.

## TURN

TURN relays media for participants whose network blocks both 7882/UDP and 7881/TCP, as some corporate networks and VPNs do. LiveKit has a TURN server built in.

| Your users | TURN |
|---|---|
| One organisation, on a network you control | Usually not needed |
| The public, on any network | Recommended: TURN over UDP on 443 |
| Networks that block all UDP | TURN over TLS as well |

Enabling or changing TURN edits `ports:` in `compose.yml`. Apply it with `docker compose up -d livekit`, which recreates the container: `docker compose restart livekit` keeps the old ports and mounts.

### TURN over UDP on 443

Many networks let UDP through on 443, because HTTP/3 uses it. LiveKit takes 443/UDP and the reverse proxy keeps 443/TCP: the two do not conflict.

1. Add to `livekit-server.yaml`:

    ```yaml
    turn:
      enabled: true
      udp_port: 443
      domain: livekit.example.com   # the relay address LiveKit gives browsers
    ```

2. In the `livekit` service of `compose.yml`, add `- "443:443/udp"` under `ports:`.
3. Open 443/UDP, see [Firewall & Ports](firewall.md).
4. Apply: `docker compose up -d livekit`.

To test it, block both 7882/UDP and 7881/TCP on a client machine, join a meeting, and check that audio and video still flow.

### TURN over TLS

A network that blocks all UDP needs TURN over TLS, on 5349/TCP, which looks like ordinary HTTPS to a firewall.

- The reverse proxy holds 443/TCP, so running TURN there instead needs a second IP address or a layer-4 load balancer in front that forwards TCP without decrypting it.
- A firewall that decrypts and inspects TLS can block every form of TURN.

LiveKit terminates this TLS itself, so it needs the certificate and key for `livekit.example.com` as files:

=== "nginx-proxy"

    acme-companion keeps the certificates in the proxy stack's `certs` volume, which Docker names `nginx-proxy_certs`. Mount it into LiveKit in `compose.yml`:

    ```yaml
    services:
      livekit:
        ports:
          - "443:443/udp"
          - "5349:5349/tcp"
          - "7881:7881/tcp"
          - "7882:7882/udp"
        volumes:
          - ./livekit-server.yaml:/config.yaml:ro
          - nginx-proxy_certs:/certs:ro

    volumes:                # merge with the file's existing top-level volumes
      nginx-proxy_certs:
        external: true
    ```

=== "Traefik"

    Traefik keeps its certificates inside `~/docker/traefik/acme.json`. Extract the `livekit.example.com` certificate and key to files on a schedule, so they follow each renewal, for example with [traefik-certs-dumper](https://github.com/ldez/traefik-certs-dumper). Mount their directory into LiveKit at `/certs`, and point `cert_file` and `key_file` of the `turn:` block at the names the tool writes.

Then add the TLS settings to the `turn:` block, open 5349/TCP, and apply with `docker compose up -d livekit`:

```yaml
turn:
  enabled: true
  udp_port: 443
  tls_port: 5349
  domain: livekit.example.com
  cert_file: /certs/livekit.example.com.crt
  key_file: /certs/livekit.example.com.key
```

LiveKit reads the certificate only at startup, so restart it after each Let's Encrypt renewal, about every 60 days. A restart drops the calls in progress, so run it at a quiet hour, from a weekly cron job for instance:

```bash
0 3 * * 0 docker compose -f ~/docker/meet/compose.yml restart livekit
```

### An external TURN server

LiveKit's built-in TURN has no plain TCP transport. For TURN over TCP on 3478, or to move relay traffic off the LiveKit server, run a separate [coturn](https://github.com/coturn/coturn) server and point LiveKit at it:

```yaml
rtc:
  turn_servers:
    - host: turn.example.com
      port: 3478
      protocol: tcp
      secret: your-coturn-shared-secret
      ttl: 14400
```

## Webhook

LiveKit reports each room event to Meet over the [webhook](../../overview/how-meet-works.md#key-concepts). The `webhook:` block of `livekit-server.yaml` sends them to `https://meet.example.com/api/v1.0/rooms/webhooks-livekit/`, and its `api_key` must equal [`LIVEKIT_API_KEY`](../../reference/env-variables.md#livekit).

## Check it works

Once the stack is up:

```bash
curl -s -o /dev/null -w "%{http_code}" https://livekit.example.com/   # prints 200
docker compose logs livekit --tail=30                                 # shows no error
```

Then join a meeting from two devices and check that both hear and see each other. If they cannot, see [No audio or video](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).

The backend's LiveKit variables are in [Environment Variables: LiveKit](../../reference/env-variables.md#livekit). Recording needs one more service, LiveKit Egress: see [Recording](recording.md).
