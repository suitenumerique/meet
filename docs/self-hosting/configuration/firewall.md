# Firewall & Ports

Open each port to any address, `0.0.0.0/0`, in your cloud provider's security group, or in [the host firewall](#the-host-firewall).

## Ports to open

| Port | Protocol | Needed when | Carries |
|---|---|---|---|
| 80 | TCP | Always | Let's Encrypt challenges, and the redirect to HTTPS |
| 443 | TCP | Always | HTTPS for Meet, its API, LiveKit's signalling WebSocket and Keycloak |
| 7881 | TCP | Always | Media, for participants whose network blocks UDP |
| 7882 | UDP | Always, with the default media port | All audio and video |
| 50000–60000 | UDP | Instead of 7882, with a [port range](livekit.md#the-media-port) | All audio and video |
| 443 | UDP | With [TURN over UDP](livekit.md#turn-over-udp-on-443) | Relayed media |
| 5349 | TCP | With [TURN over TLS](livekit.md#turn-over-tls) | Relayed media, inside TLS |
| 5060 | UDP | With [telephony](telephony.md) | SIP signalling from your phone provider |
| 10000–20000 | UDP | With telephony | Phone call audio |

LiveKit's own list: [ports and firewall](https://docs.livekit.io/home/self-hosting/ports-firewall/).

## Never public

| Port | Service |
|---|---|
| 7880 | LiveKit's signalling, behind the reverse proxy |
| 8083 | The frontend's nginx, behind the reverse proxy |
| 8080 | Keycloak, behind the reverse proxy |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9000 | Garage's S3 API, when you run it for recording, and Keycloak's health checks |

The Docker Compose files publish none of these.

## The host firewall

ufw and firewalld do not filter a port Docker publishes, which with Docker Compose is every port above: filter those in your cloud provider's security group, and never publish a port that must stay closed.

The host firewall matters for the ports Docker does not publish, such as LiveKit's on Kubernetes:

=== "ufw"

    ```bash
    sudo ufw allow 7881/tcp
    # 7882/udp, or your port range
    sudo ufw allow 7882/udp
    # With TURN over UDP
    sudo ufw allow 443/udp
    # With TURN over TLS
    sudo ufw allow 5349/tcp
    sudo ufw reload
    ```

=== "firewalld"

    ```bash
    sudo firewall-cmd --permanent --add-port=7881/tcp
    # 7882/udp, or your port range
    sudo firewall-cmd --permanent --add-port=7882/udp
    # With TURN over UDP
    sudo firewall-cmd --permanent --add-port=443/udp
    # With TURN over TLS
    sudo firewall-cmd --permanent --add-port=5349/tcp
    sudo firewall-cmd --reload
    ```

## Check the ports

```bash
# From another machine: each connects when its TCP port is open
nc -zv meet.example.com 443
nc -zv meet.example.com 7881
```

`nc -zuv` cannot prove a UDP port is open. To test 7882/UDP, hold a call between two devices on different networks. On the server, `docker compose ps livekit` lists the published ports.
