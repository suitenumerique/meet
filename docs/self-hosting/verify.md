# Check your install

Run these checks after installing Meet, after changing its settings, and after an AI assistant did either for you: an assistant can report success on an install that cannot carry a call, and a page that loads does not prove that calls work. Together the checks show that Meet runs as you configured it and that two people on different networks can see and hear each other. They go from the cheapest to the most complete. An assistant can run the first seven and report each output; from the connection test on, each check needs a browser, and the call needs two devices.

On Docker Compose, run the commands in the Meet stack's directory, `~/docker/meet`, unless a check names another. On Kubernetes, they need `kubectl` access to the `meet` namespace.

## Summary

| Check | What it proves | Passing looks like |
|---|---|---|
| [Every service runs](#every-service-runs) | Every container or pod started and stays up | Every service `Up`, with `backend` and `postgresql` `(healthy)`, or every pod `Running` |
| [The backend passes its checks](#the-backend-passes-its-checks) | The backend reaches its database, every migration is applied, and its security settings fit production | `System check identified no issues` |
| [The three addresses answer over HTTPS](#the-three-addresses-answer-over-https) | DNS, the reverse proxy and the certificates work for each domain | `200` for each address |
| [The backend serves your configuration](#the-backend-serves-your-configuration) | Browsers get your LiveKit address and the features you turned on | `livekit.url` is your LiveKit domain, and each feature you turned on reads `true` |
| [Sign-in reaches your provider](#sign-in-reaches-your-provider) | Meet sends sign-ins to your provider, the provider accepts Meet, and the backend reaches the provider | `302` to your provider, then `200`, then `200` |
| [LiveKit is reachable from outside](#livekit-is-reachable-from-outside) | LiveKit gives browsers your public IP, and its TCP media port is open | `nodeIP` is your server's public IP, then `open` |
| [Email leaves the server](#email-leaves-the-server) | Your SMTP server accepts mail from Meet's sender address | `1`, then the message in your inbox |
| [The connection test passes](#the-connection-test-passes) | One browser reaches LiveKit and sends audio and video | **Everything works**, or **Partially tested** with only **TURN** skipped |
| [A call works across networks](#a-call-works-across-networks) | Media crosses your firewall from a network other than the server's | Audio and video both ways between two devices |
| [LiveKit reports the call to the backend](#livekit-reports-the-call-to-the-backend) | LiveKit's room events reach the backend | Each `webhooks-livekit` line shows `200` |
| [Each feature you turned on works](#each-feature-you-turned-on-works) | Recording, subtitles, telephony and transcription work end to end | Each guide's test passes |

## Every service runs

=== "Docker Compose"

    ```console
    $ docker compose ps --format 'table {{.Service}}\t{{.Status}}'
    SERVICE      STATUS
    backend      Up 2 minutes (healthy)
    celery       Up 2 minutes
    frontend     Up 2 minutes
    livekit      Up 2 minutes
    postgresql   Up 6 minutes (healthy)
    redis        Up 6 minutes
    ```

    Every service shows `Up`, and `backend` and `postgresql` show `(healthy)`. A service you turned on with `COMPOSE_PROFILES`, such as `livekit-egress`, is in the list too. Run the command again a minute later: an `Up` time that went back down means the container restarted. Then run it in `~/docker/keycloak`, where `keycloak` and `postgresql` show `(healthy)`, and in your reverse proxy's directory.

=== "Kubernetes"

    ```bash
    kubectl -n meet get pods
    kubectl -n meet get certificate
    ```

    Every pod shows `Running`, with all its containers ready in the `READY` column, such as `1/1`. The backend counts as ready only while its `/__heartbeat__` answers, which fails when the database is down. LiveKit's pods, `livekit-server-…`, are in the list too, and every certificate shows `True` under `READY`.

## The backend passes its checks

The backend checks that its database answers, that every migration is applied and that its security settings fit production:

=== "Docker Compose"

    ```console
    $ docker compose exec backend python manage.py check --deploy
    System check identified no issues (0 silenced).
    ```

=== "Kubernetes"

    ```console
    $ kubectl -n meet exec deploy/meet-backend -- python manage.py check --deploy
    System check identified no issues (0 silenced).
    ```

Any other output lists each issue on its own line.

## The three addresses answer over HTTPS

Run these from another machine than the server, so each request goes through DNS and the firewall as a visitor's does. Put your three domains in the commands, and check `auth.example.com` only when Keycloak is your provider:

```console
$ curl -s -o /dev/null -w "%{http_code}\n" https://meet.example.com/
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://auth.example.com/realms/meet
200

$ curl -s -o /dev/null -w "%{http_code}\n" https://livekit.example.com/
200
```

curl refuses a certificate it cannot verify, so any status proves the certificate is valid, while `000` means curl got no answer it trusts.

## The backend serves your configuration

Every browser asks the backend which features are on and where LiveKit is, at `/api/v1.0/config/`. Read it with [jq](https://jqlang.org/):

```console
$ curl -s https://meet.example.com/api/v1.0/config/ | jq
{
  "LANGUAGE_CODE": "en-us",
  "recording": {
    "is_enabled": false,
    ...
  },
  ...
  "telephony": {
    "enabled": false
  },
  ...
  "subtitle": {
    "enabled": false
  },
  "diagnostics": {
    "connection_test_enabled": false
  },
  "livekit": {
    "url": "https://livekit.example.com",
    ...
  },
  ...
}
```

That answer comes from an install with no optional feature. Read these keys:

- `livekit.url`: the address browsers connect to for audio and video, set by [`LIVEKIT_API_URL`](../reference/env-variables.md#LIVEKIT_API_URL). It is your LiveKit domain over `https://`, never an internal address such as `http://livekit:7880`.
- `recording.is_enabled`, `subtitle.enabled` and `telephony.enabled`: `true` for each feature you turned on, `false` for the others. `telephony.enabled` stays `false` while the backend cannot read [`ROOM_TELEPHONY_PHONE_NUMBER`](../reference/env-variables.md#ROOM_TELEPHONY_PHONE_NUMBER) as a phone number, and the backend's log [says so](https://github.com/suitenumerique/meet/blob/main/src/backend/core/utils.py#L508-L515).
- `diagnostics.connection_test_enabled`: `true` once [the connection test](#the-connection-test-passes) is on.

## Sign-in reaches your provider

Clicking **Login** opens `/api/v1.0/authenticate/`, which redirects to your provider. Follow that redirect:

```console
$ AUTH=https://meet.example.com/api/v1.0/authenticate/
$ curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $AUTH | cut -d'?' -f1
302 https://auth.example.com/realms/meet/protocol/openid-connect/auth

$ curl -sL -o /dev/null -w '%{http_code}\n' $AUTH
200
```

The first answer is a `302` to your provider's sign-in page, [`OIDC_OP_AUTHORIZATION_ENDPOINT`](../reference/env-variables.md#OIDC_OP_AUTHORIZATION_ENDPOINT). The second follows it: `200` means the provider shows its login page for Meet's client ID and redirect URI, and Keycloak answers `400` when it refuses either.

After the visitor signs in, the backend itself calls the provider to finish the sign-in. Check that it reaches the provider's signing keys, at [`OIDC_OP_JWKS_ENDPOINT`](../reference/env-variables.md#OIDC_OP_JWKS_ENDPOINT), from where it runs:

```console
$ E="os.environ['OIDC_OP_JWKS_ENDPOINT']"
$ PY="import os, urllib.request as u; print(u.urlopen($E).status)"
```

=== "Docker Compose"

    ```console
    $ docker compose exec backend python -c "$PY"
    200
    ```

=== "Kubernetes"

    ```console
    $ kubectl -n meet exec deploy/meet-backend -- python -c "$PY"
    200
    ```

## LiveKit is reachable from outside

Browsers send audio and video straight to LiveKit, on the ports of [Firewall & Ports](configuration/firewall.md#ports-to-open), at the address LiveKit gives them, its `nodeIP`:

=== "Docker Compose"

    ```console
    $ docker compose logs livekit | grep -o '"nodeIP": "[^"]*"'
    "nodeIP": "203.0.113.10"
    ```

=== "Kubernetes"

    ```bash
    kubectl -n meet logs deploy/livekit-server | grep -o '"nodeIP": "[^"]*"'
    ```

    The line names the public IP of the node running that pod.

`nodeIP` is your server's public IP, the address your DNS gives `livekit.example.com`. A private address, such as the container's own `172.30.0.3`, means LiveKit did not learn its public IP: check [`use_external_ip`](configuration/livekit.md#use_external_ip).

Then, from another machine, check 7881/TCP, the media port for networks that block UDP:

```console
$ nc -z -w 5 livekit.example.com 7881 && echo open
open
```

No command proves that 7882/UDP is open: the connection test and the call do.

## Email leaves the server

Meet emails recording links and room invitations, as [Email (SMTP)](configuration/email.md) explains. Send a test from the backend, with your own address in place of `you@example.com`:

```console
$ TO=you@example.com
$ IMP="from django.core.mail import send_mail; from django.conf import settings"
$ PY="$IMP; print(send_mail('Meet test', 'OK', settings.EMAIL_FROM, ['$TO']))"
```

=== "Docker Compose"

    ```console
    $ docker compose exec backend python manage.py shell -v 0 -c "$PY"
    1
    ```

=== "Kubernetes"

    ```console
    $ POD=deploy/meet-backend
    $ kubectl -n meet exec $POD -- python manage.py shell -v 0 -c "$PY"
    1
    ```

`1` means your SMTP server accepted the message, sent from [`DJANGO_EMAIL_FROM`](../reference/env-variables.md#DJANGO_EMAIL_FROM). Check that it reached your inbox, spam folder included. Django's own `sendtestemail` command sends from `webmaster@localhost` instead, so it does not test Meet's sender.

## The connection test passes

Meet ships a page that tests one browser's connection to LiveKit: the WebSocket, the media path, TURN, and sending audio and video. It is off by default, and once on, anyone can open it, signed in or not. Turn it on with [`CONNECTION_TEST_ENABLED=True`](../reference/env-variables.md#CONNECTION_TEST_ENABLED), as [Applying a change](customising.md#applying-a-change) shows, then:

1. On a computer with a camera and a microphone, outside the server's network, open `https://meet.example.com/test-connection`.
2. Click **Run test**, and allow the camera and the microphone.
3. Wait for every step to finish, about a minute.

The summary reads **Everything works**. Without [TURN](configuration/livekit.md#turn), the **TURN** step shows **Skipped** and the summary reads **Partially tested**, which passes too when every other step shows **Passed**. The **Selected route** step names the path the media took: `over udp` means 7882/UDP is open from that network.

## A call works across networks

1. Open `https://meet.example.com`, click **Login** and sign in: you land back on Meet, signed in.
2. Click **Create a meeting**, then join the same meeting from a second device on another network, a phone on mobile data for example.
3. Turn on the camera and the microphone on both devices.

Each device sees and hears the other. Only a second network shows whether media crosses your firewall, since a device on the server's own network can reach LiveKit by a path visitors do not have.

## LiveKit reports the call to the backend

LiveKit sends each room event to the backend through its [webhook](configuration/livekit.md#webhook), and recording, telephony and the waiting room rely on these events. After the call:

=== "Docker Compose"

    ```console
    $ docker compose logs backend | grep webhooks-livekit
    backend-1  | ... "POST /api/v1.0/rooms/webhooks-livekit/ HTTP/1.1" 200 ...
    ```

=== "Kubernetes"

    ```console
    $ kubectl -n meet logs deploy/meet-backend | grep webhooks-livekit
    ... "POST /api/v1.0/rooms/webhooks-livekit/ HTTP/1.1" 200 ...
    ```

Each line shows `200`, the backend's answer to LiveKit. No line at all means LiveKit's events never reached the backend.

## Each feature you turned on works

- **Recording**: record a minute, then check that the email arrives and its link plays the file, as [Recording: Test it](configuration/recording.md#test-it) shows.
- **Subtitles**: captions appear when someone speaks, as [Real-time Subtitles: Test it](configuration/subtitles.md#test-it) shows.
- **Telephony**: a phone joins the meeting, as [Telephony: Test a call](configuration/telephony.md#test-a-call) shows.
- **Transcription**: a transcript you start reaches your [LaSuite Docs](https://github.com/suitenumerique/docs) as a document, as [AI Transcription](configuration/transcription.md) describes.

## When a check fails

| Check | What the failure means | What to read |
|---|---|---|
| Every service runs | A service stopped, restarts, or never became healthy | Its logs, as the [Diagnostic checklist](../reference/troubleshooting.md#diagnostic-checklist) shows. A backend that never starts: [Backend runs the Development configuration](../reference/troubleshooting.md#backend-runs-the-development-configuration-or-fails-at-start) |
| The backend passes its checks | `Unapplied migration`: the tables are older than the code. `Could not connect to database`: the backend's `DB_` settings do not reach PostgreSQL | Run the migrations, as [Create the tables](compose/deployment-guide.md#create-the-tables-and-an-admin-account) shows on Docker Compose and [Upgrading](kubernetes/helm.md#upgrading) on Kubernetes |
| The three addresses answer over HTTPS | `000`: no certificate, or DNS points elsewhere. `502`: the proxy cannot reach Meet | [TLS certificate not being issued](../reference/troubleshooting.md#tls-certificate-not-being-issued), [502 Bad Gateway on all routes](../reference/troubleshooting.md#502-bad-gateway-on-all-routes) |
| The backend serves your configuration | `livekit.url` is an internal address, or a feature reads `false` | [Disconnected from meeting immediately](../reference/troubleshooting.md#disconnected-from-meeting-immediately-you-have-left-the-meeting), [Recording button is missing](../reference/troubleshooting.md#recording-button-is-missing), [No captions appear](../reference/troubleshooting.md#no-captions-appear) |
| Sign-in reaches your provider | The provider refuses Meet's client ID or redirect URI, or the backend's request ends in `URLError` | [Login redirects but loops back](../reference/troubleshooting.md#login-redirects-but-loops-back-or-the-provider-says-invalid-parameter-redirect_uri) |
| LiveKit is reachable from outside | LiveKit gives browsers an address they cannot reach, or a firewall blocks 7881/TCP | [Can join the room but no audio/video](../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo) |
| Email leaves the server | A traceback: the backend cannot reach or sign in to your SMTP server | [Email (SMTP): What to set](configuration/email.md#what-to-set) |
| The connection test passes | **WebSocket** fails: browsers cannot reach LiveKit's domain. **TURN** fails: TURN does not relay. Another network step fails: media ports are closed | [Disconnected from meeting immediately](../reference/troubleshooting.md#disconnected-from-meeting-immediately-you-have-left-the-meeting), [TURN is enabled but does not relay](../reference/troubleshooting.md#turn-is-enabled-but-does-not-relay), [Can join the room but no audio/video](../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo) |
| A call works across networks | The second network blocks every media path LiveKit offers | [Can join the room but no audio/video](../reference/troubleshooting.md#can-join-the-room-but-no-audiovideo) |
| LiveKit reports the call to the backend | No line: LiveKit cannot reach the webhook's URL. Another status: the backend refused or failed on the event | [Recording button clicked but UI stays on "starting"](../reference/troubleshooting.md#recording-button-clicked-but-ui-stays-on-starting), whose fix checks the webhook |
| Each feature you turned on works | The feature's own setup is incomplete | [Recording issues](../reference/troubleshooting.md#recording-issues), [Subtitles issues](../reference/troubleshooting.md#subtitles-issues), [Telephony issues](../reference/troubleshooting.md#telephony-issues) |
