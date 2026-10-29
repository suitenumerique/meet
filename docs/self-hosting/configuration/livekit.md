# LiveKit & TURN

LiveKit is the media server: every participant sends it their audio and video, and it forwards each stream to the others. The [Deployment Guide](../compose/deployment-guide.md)'s [`livekit-server.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/livekit-server.yaml) works as shipped. The backend's LiveKit variables are in [Environment Variables: LiveKit](../../reference/env-variables.md#livekit).

## How media connects

[Signalling](../../overview/how-meet-works.md#key-concepts) goes through your reverse proxy on 443 to LiveKit's port 7880, which stays [private](firewall.md#never-public). Media goes straight between the browser and LiveKit, on the first path the network allows:

| Path | Port | Used when |
|---|---|---|
| Direct UDP | 7882/UDP | Always tried first, with the lowest latency |
| TCP | 7881/TCP | The network blocks 7882/UDP. Adds latency |
| TURN relay | 443/UDP, or TLS on 5349/TCP | The network blocks both. Off until you [enable TURN](#turn) |

A participant whose network allows none of these joins but gets no audio or video. If a phone hotspot fixes it, their network blocks the media ports.

## The media port

`livekit-server.yaml` sends all media through one UDP port, 7882, or through a wide range. Set one, never both: once a range is set, `udp_port` has no effect.

=== "One port, or a few (default)"

    ```yaml title="livekit-server.yaml"
    rtc:
      tcp_port: 7881
      # Or a small range, e.g. 7882-7885
      udp_port: 7882
      use_external_ip: true
    ```

    For performance, LiveKit recommends at least one port per CPU core. Publish and open every port of the range.

=== "A wide range"

    ```yaml title="livekit-server.yaml"
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true
    ```

    A range opens far more ports to the internet: use it only when several LiveKit processes share one host. In `compose.yml`, replace `"7882:7882/udp"` with `"50000-60000:50000-60000/udp"`.

On Kubernetes, the chart serves the media ports from the node itself, see [Helm: LiveKit media ports](../kubernetes/helm.md#livekit-media-ports).

## `use_external_ip`

Set in the example file, it makes LiveKit learn its public IP at startup from a [STUN](../../overview/how-meet-works.md#key-concepts) server. A host whose public IP is not on its network interface needs it: AWS, GCP, Azure, any host behind NAT.

The server needs outbound UDP to `global.stun.twilio.com:3478`, `stun.l.google.com:19302` and `stun1.l.google.com:19302`, the STUN servers LiveKit [asks](https://github.com/livekit/mediatransportutil/blob/725c5cc4266dbe7e69a01adbaba5a884c7fc09c9/pkg/rtcconfig/config.go#L38-L42) unless `stun_servers` under `rtc:` names others.

## TURN

LiveKit's built-in TURN server relays media for participants whose network blocks both 7882/UDP and 7881/TCP, as some corporate networks and VPNs do.

| Your users | TURN |
|---|---|
| One organisation, on a network you control | Usually not needed |
| The public, on any network | Recommended: TURN over UDP on 443 |
| Networks that block all UDP | TURN over TLS as well |

Apply a TURN change with `docker compose up -d livekit`: `docker compose restart livekit` keeps the old ports and mounts.

### TURN over UDP on 443

Many networks let UDP through on 443, for HTTP/3. LiveKit takes 443/UDP, and the reverse proxy keeps 443/TCP.

1. Add to `livekit-server.yaml`:

    ```yaml title="livekit-server.yaml"
    turn:
      enabled: true
      udp_port: 443
      # The relay address LiveKit gives browsers
      domain: livekit.example.com
    ```

2. In the `livekit` service of `compose.yml`, add `- "443:443/udp"` under `ports:`.
3. Open 443/UDP, see [Firewall & Ports](firewall.md).
4. Apply: `docker compose up -d livekit`.

To test it, block both 7882/UDP and 7881/TCP on a client machine, join a meeting, and check that audio and video still flow.

### TURN over TLS

A network that blocks all UDP needs TURN over TLS, on 5349/TCP, which looks like HTTPS to a firewall. Two limits:

- TURN on 443/TCP instead needs a second IP address, or a layer-4 load balancer that forwards TCP without decrypting it, since the reverse proxy holds that port.
- A firewall that decrypts and inspects TLS can block every form of TURN.

LiveKit needs the certificate and key for `livekit.example.com` as files:

=== "nginx-proxy"

    acme-companion keeps the certificates in the proxy stack's `certs` volume, which Docker names `nginx-proxy_certs`. Mount it into LiveKit in `compose.yml`:

    ```yaml title="compose.yml"
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

    # Merge with the file's existing top-level volumes
    volumes:
      nginx-proxy_certs:
        external: true
    ```

=== "Traefik"

    Traefik keeps its certificates inside `~/docker/traefik/acme.json`. To use them:

    1. Extract the `livekit.example.com` certificate and key to files on a schedule, so they follow each renewal, for example with [traefik-certs-dumper](https://github.com/ldez/traefik-certs-dumper).
    2. Mount their directory into LiveKit at `/certs`.
    3. Point `cert_file` and `key_file` of the `turn:` block at the names the tool writes.

Then add the TLS settings to the `turn:` block, open 5349/TCP, and apply with `docker compose up -d livekit`:

```yaml title="livekit-server.yaml"
turn:
  enabled: true
  udp_port: 443
  tls_port: 5349
  domain: livekit.example.com
  cert_file: /certs/livekit.example.com.crt
  key_file: /certs/livekit.example.com.key
```

LiveKit reads the certificate only at startup: restart it after each Let's Encrypt renewal, about every 60 days. A restart drops the calls in progress, so schedule it at a quiet hour:

```bash
0 3 * * 0 docker compose -f ~/docker/meet/compose.yml restart livekit
```

### An external TURN server

LiveKit's built-in TURN has no plain TCP transport. For TURN over TCP on 3478, or to move relay traffic off the LiveKit server, run a separate [coturn](https://github.com/coturn/coturn) server and point LiveKit at it:

```yaml title="livekit-server.yaml"
rtc:
  turn_servers:
    - host: turn.example.com
      port: 3478
      protocol: tcp
      secret: your-coturn-shared-secret
      ttl: 14400
```

## Webhook

The `webhook:` block of `livekit-server.yaml` sends each room event to `https://meet.example.com/api/v1.0/rooms/webhooks-livekit/`, see [webhook](../../overview/how-meet-works.md#key-concepts). Its `api_key` must equal [`LIVEKIT_API_KEY`](../../reference/env-variables.md#LIVEKIT_API_KEY).

## Check it works

`docker compose logs livekit --tail=30` should show no `ERROR` line. Then join a meeting from two devices: if they cannot hear and see each other, see [No audio or video](../../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo).
