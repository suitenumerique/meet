# TURN Server

TURN (Traversal Using Relays around NAT) is a relay protocol that routes WebRTC media through a well-known port when direct UDP is blocked. Without TURN, participants on corporate networks, hotel Wi-Fi, or VPNs may connect to a meeting but have no audio or video.

---

## Do you need TURN?

| Deployment | Recommendation |
|---|---|
| Internal team, controlled network | TURN optional - direct media (7882/UDP) works |
| Public instance, mixed networks | TURN recommended |
| Enterprise | TURN required - corporate firewalls routinely block non-standard UDP |

**How to tell if TURN is needed:** participants who connect (room appears joined, participants list shows them) but have no audio or video, and this resolves when they switch to a phone hotspot - that is a UDP-blocked network. TURN solves it.

---

## How LiveKit TURN works

LiveKit has a built-in TURN server. When a participant's ICE negotiation fails over UDP 7882, the browser falls back to TURN:

1. Browser connects to LiveKit via WebSocket (443/TCP, already working)
2. LiveKit advertises its TURN address in ICE candidates
3. Browser establishes a TURN allocation on 443/UDP
4. All media is relayed through that allocation

The result: media travels over a port that firewalls universally allow, indistinguishable from regular HTTPS.

---

## Option 1: Built-in TURN on 443/UDP (recommended)

The simplest setup. No extra server, no coturn. LiveKit serves TURN directly alongside your existing stack.

### Step 1: Add the `turn:` block to `livekit-server.yaml`

```yaml
port: 7880

rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true

turn:
  enabled: true
  udp_port: 443
  domain: livekit.example.com

keys:
  meet: your-livekit-api-secret-here

redis:
  address: redis:6379

logging:
  level: info
```

- `udp_port: 443` - LiveKit listens for TURN UDP on port 443. Your reverse proxy holds 443/TCP; these are separate sockets on Linux and do not conflict.
- `domain: livekit.example.com` - LiveKit announces this domain in TURN candidates so clients know where to connect.

### Step 2: Expose 443/UDP in `compose.yml`

In the `livekit` service, add the UDP mapping:

```yaml
ports:
  - "443:443/udp"
  - "7881:7881/tcp"
  - "7882:7882/udp"
```

### Step 3: Open 443/UDP on your firewall

```bash
# ufw
sudo ufw allow 443/udp && sudo ufw reload

# firewalld
sudo firewall-cmd --zone=public --permanent --add-port=443/udp && sudo firewall-cmd --reload
```

For cloud provider security groups, add an inbound UDP rule for port 443 from `0.0.0.0/0`.

### Step 4: Restart LiveKit

```bash
docker compose restart livekit
```

### Verify TURN is working

Check that LiveKit logs show TURN is active:

```bash
docker compose logs livekit | grep -i turn
# Expected: something like "starting TURN server" or "TURN UDP listening on :443"
```

Then join a meeting from a restricted network (or simulate it by blocking port 7882 in a local firewall rule) and confirm audio/video works.

---

## Option 2: TURN over TLS

Some networks block all UDP, including 443/UDP. For those, TURN can be served over TLS on port 5349 (the IANA standard TURN/TLS port). LiveKit needs direct access to a TLS certificate for this - it cannot use the certificate held by your reverse proxy.

**This is an advanced setup.** Most deployments do not need it. Enable it only if you have evidence of participants on UDP-blocking networks.

### Step 1: Get the certificate files

You need `fullchain.pem` and `privkey.pem` for `livekit.example.com` as files on disk. How to get them depends on your reverse proxy:

=== "nginx-proxy + acme-companion"

    acme-companion stores certificates in a Docker volume. Find the volume:

    ```bash
    docker volume inspect acme-companion_certs
    # Look for the Mountpoint path
    ```

    The files are at `<mountpoint>/livekit.example.com/fullchain.pem` and `.../privkey.pem`.

    Mount that directory read-only into the LiveKit container (see Step 2).

=== "Traefik"

    Traefik stores certificates in `acme.json`. Extract the certificate for `livekit.example.com`:

    ```bash
    # Install traefik-certs-dumper (https://github.com/ldez/traefik-certs-dumper)
    traefik-certs-dumper file --source ./acme.json --dest ./certs/
    ```

    Run this on a schedule (e.g., weekly cron) to keep the extracted files current after renewal.

    Alternatively, use Traefik's `tls.certificates` stanza to write certificates to disk directly.

### Step 2: Update `livekit-server.yaml`

```yaml
turn:
  enabled: true
  udp_port: 443
  tls_port: 5349
  domain: livekit.example.com
  cert_file: /certs/fullchain.pem
  key_file:  /certs/privkey.pem
```

!!!info 
    `cert_file` and `key_file` are paths **inside the LiveKit container**. Mount the host certificate directory as a volume (Step 3).

### Step 3: Update `compose.yml`

```yaml
livekit:
  ports:
    - "443:443/udp"
    - "5349:5349/tcp"
    - "7881:7881/tcp"
    - "7882:7882/udp"
  volumes:
    - ./livekit-server.yaml:/config.yaml:ro
    - /path/to/certs:/certs:ro   # mount host cert directory
```

Replace `/path/to/certs` with the directory containing `fullchain.pem` and `privkey.pem`.

### Step 4: Open port 5349

```bash
# ufw
sudo ufw allow 5349/tcp && sudo ufw reload

# firewalld
sudo firewall-cmd --zone=public --permanent --add-port=5349/tcp && sudo firewall-cmd --reload
```

Add an inbound TCP rule for 5349 in your cloud security group.

### Step 5: Restart LiveKit

```bash
docker compose restart livekit
```

### Certificate renewal

Let's Encrypt certificates renew every 90 days. After renewal, LiveKit must be restarted to pick up the new certificate files - it does not hot-reload them.

Add a cron job or systemd timer to restart LiveKit after certificate renewal:

```bash
# Example: weekly restart (safe; LiveKit restarts in seconds)
0 3 * * 0 docker compose -f /path/to/your/compose.yml restart livekit
```

---

## Option 3: External TURN server (coturn)

If you want to run TURN on a separate host - for example, to offload relay traffic from the LiveKit server - configure LiveKit to use an external coturn instance:

```yaml
rtc:
  turn_servers:
    - host: turn.example.com
      port: 443
      protocol: tls
      username: turnuser
      credential: turnpassword
```

LiveKit announces this server in ICE candidates instead of its built-in TURN. The coturn instance must be deployed and configured separately; its setup is outside the scope of this guide.

---

## Troubleshooting TURN

**TURN is configured but participants on restricted networks still have no media**

1. Confirm 443/UDP is open: `nc -zuv your-server.example.com 443`
2. Check LiveKit is bound to 443/UDP: `ss -tulpn | grep 443`
3. Check LiveKit logs for TURN errors: `docker compose logs livekit | grep -i "turn\|error"`
4. Verify `domain` in `livekit-server.yaml` matches your actual LiveKit subdomain

**Port conflict on 443/UDP**

Only LiveKit should be bound to 443/UDP. If another process is already using it:

```bash
ss -ulpn | grep :443
```

**TURN/TLS: certificate errors on startup**

LiveKit logs `failed to load certificate` or similar. Check:
- The paths in `cert_file`/`key_file` are correct inside the container (not on the host)
- The volume mount in `compose.yml` is correct
- The certificate files are readable: `docker compose exec livekit ls -l /certs/`

**Participants still can't connect after TURN is enabled**

Some very restrictive networks (full TLS inspection proxies, "application-aware" firewalls) can still block TURN/UDP even on port 443. In those cases, [TURN over TLS (Option 2)](#option-2-turn-over-tls) is the only solution, as it wraps media inside a genuine TLS handshake on port 5349.
