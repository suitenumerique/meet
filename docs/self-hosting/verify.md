# Check your install

Run this check on the server after installing or changing Meet with Docker Compose, and always after an AI assistant did it for you: a page that loads does not prove that calls work. On Kubernetes, follow [Check the install](kubernetes/helm.md#check-the-install) in the Helm guide instead.

## Run the check

```console
$ cd ~/docker/meet && curl -fsSL https://raw.githubusercontent.com/suitenumerique/meet/main/docs/check-install.sh | bash
Your setup
  Version    v1.36.3 (image lasuite/meet-backend:latest)
  Meet       meet.example.com
  LiveKit    livekit.example.com
  Sign-in    auth.example.com
  Profiles   none
  Features   none turned on

Checks
  ✓ Meet stack: 6 services running, health checks passing
  ✓ Keycloak stack: 2 services running, health checks passing
  ✓ Backend: manage.py check --deploy passes
  ✓ https://meet.example.com/ answers 200, certificate valid
  ✓ https://livekit.example.com/ answers 200, certificate valid
  ✓ https://auth.example.com/realms/meet answers 200, certificate valid
  ✓ Meet sends browsers to LiveKit at https://livekit.example.com
  ✓ Sign-in sends browsers to auth.example.com
  ✓ LiveKit announces 203.0.113.10, the address of livekit.example.com
  ✓ livekit.example.com:7881 accepts TCP from this server; a test from outside is stronger
  - LiveKit webhooks: no call yet

All 10 checks passed. Now join a meeting from two devices on different networks.
```

Each failing line starts with ✗ and names its cause. Fix that cause, with [Troubleshooting](../reference/troubleshooting.md) for the details, then run the command again.

## Make a call across two networks

No command proves that audio and video cross your firewall. A call between two networks does:

1. Open your Meet address, click **Login** and sign in.
2. Click **Create a meeting**, then **Start an instant meeting**, and open the meeting's link on a second device on another network, a phone on mobile data for example. With the camera and the microphone on, each device sees and hears the other.
3. Run the check again: the `LiveKit webhooks` line now passes, which proves that LiveKit reports the call to Meet.
