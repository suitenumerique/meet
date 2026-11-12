# Telephony Integration

Callers join a meeting by phone through [LiveKit SIP](https://github.com/livekit/sip), LiveKit's [SIP](../../overview/how-meet-works.md#key-concepts) bridge: they dial your number, enter the room's PIN and join with audio only. Recordings include their audio.

!!! info
    Only Docker Compose is covered: the Helm chart does not deploy LiveKit SIP.

```
Phone ──► PSTN ──► SIP Trunk ──► LiveKit SIP Bridge ──► LiveKit Room
```

The PSTN is the public phone network.

## Prerequisites

- A SIP trunk from a VoIP provider such as [Twilio](https://www.twilio.com/docs/sip-trunking), [Vonage](https://developer.vonage.com/en/sip/overview) or [Infobip](https://www.infobip.com/docs/voice-and-video/sip-trunking), or a self-hosted [Asterisk](https://www.asterisk.org/) or [FreeSWITCH](https://signalwire.com/freeswitch).
- A phone number from that provider.
- The ports of the [firewall table](firewall.md) marked for telephony.
- LiveKit's [webhook](livekit.md#webhook) to Meet, which the [Deployment Guide](../compose/deployment-guide.md#stack-3-meet-core) already sets.

## Meet backend

Uncomment the Telephony lines of `env.d/common`, then put your number in place of `<your phone number>`, and your two-letter country code in place of `FR`:

```dotenv title="env.d/common"
ROOM_TELEPHONY_PHONE_NUMBER=+33123456789
ROOM_TELEPHONY_DEFAULT_COUNTRY=FR
```

If [`ROOM_TELEPHONY_PHONE_NUMBER`](../../reference/env-variables.md#ROOM_TELEPHONY_PHONE_NUMBER) is missing or cannot be parsed with [`ROOM_TELEPHONY_DEFAULT_COUNTRY`](../../reference/env-variables.md#ROOM_TELEPHONY_DEFAULT_COUNTRY), Meet shows no dial-in number and the backend logs a warning. Every other variable and default is in [Environment Variables: Telephony](../../reference/env-variables.md#telephony).

## LiveKit SIP service

Download LiveKit SIP's config, [`livekit-sip.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/livekit-sip.yaml), and the [inbound trunk](#inbound-sip-trunk) into the Meet stack:

```bash
cd ~/docker/meet
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL --remote-name-all \
  $RAW/docs/examples/meet/{livekit-sip.yaml,inbound-trunk.json}
```

Then fill the LiveKit secret of `livekit-sip.yaml`, and your number in `inbound-trunk.json`, with the Meet stack's script:

```console
$ bash generate-secrets.sh
...
set LIVEKIT_API_SECRET in livekit-sip.yaml
set ROOM_TELEPHONY_PHONE_NUMBER in inbound-trunk.json
kept LIVEKIT_API_SECRET in livekit-server.yaml: no placeholder left
```

`compose.yml` holds LiveKit SIP under the `telephony` profile. Turn it on with [`COMPOSE_PROFILES`](https://docs.docker.com/compose/how-tos/profiles/) in the Meet stack's `.env`, comma-separated after any profile already there:

```dotenv title=".env"
COMPOSE_PROFILES=telephony
```

Start it, and recreate the backend with the settings above:

```bash
docker compose up -d
```

## Inbound SIP trunk

The trunk tells LiveKit SIP which calls to accept. The script put your number in [`inbound-trunk.json`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/inbound-trunk.json); put your provider's signalling addresses in place of its `allowed_addresses` placeholder.

`allowed_addresses` takes IP addresses or CIDR ranges, not hostnames; an empty list accepts calls from any address.

Create the trunk once with the [LiveKit CLI](https://github.com/livekit/livekit-cli), `lk`, with the same secret:

```bash
SECRET=$(sed -n 's/^LIVEKIT_API_SECRET=//p' ~/docker/meet/env.d/common)
lk sip inbound create \
  --url https://livekit.example.com \
  --api-key meet \
  --api-secret "$SECRET" \
  inbound-trunk.json
```

## SIP provider setup (Twilio example)

1. Create a Twilio account and obtain a phone number.
2. In the Twilio console, create a SIP Trunk.
3. Point the origination URI at your LiveKit SIP service: `sip:livekit.example.com:5060`.

## Audio prompt language

LiveKit SIP speaks its prompts, the PIN prompt among them, in English. For another language, mount that language's audio files from its [`res` directory](https://github.com/livekit/sip/tree/main/res) as a volume on the `livekit-sip` service.

## Test a call

Join a room from a browser, call [`ROOM_TELEPHONY_PHONE_NUMBER`](../../reference/env-variables.md#ROOM_TELEPHONY_PHONE_NUMBER), and enter the PIN shown after **Code:** in the **Meeting information** panel. When the call fails, see [Telephony issues](../../reference/troubleshooting.md#telephony-issues).

## Limitations

- Dial-in only: Meet does not implement calling out.
- Meet displays a single dial-in number, [`ROOM_TELEPHONY_PHONE_NUMBER`](../../reference/env-variables.md#ROOM_TELEPHONY_PHONE_NUMBER).
- Callers other than [Roomkit](../../reference/env-variables.md#roomkit-meeting-room-sip-devices) devices join only while someone is connected from a browser, since Meet creates and deletes each room's [dispatch rule](../../overview/how-meet-works.md#agents-and-phone-calls) itself.
