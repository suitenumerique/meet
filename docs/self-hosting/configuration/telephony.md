# Telephony Integration

Callers join a meeting by phone through [LiveKit SIP](https://github.com/livekit/sip), LiveKit's [SIP](../../overview/how-meet-works.md#key-concepts) bridge: they dial your number, enter the room's PIN and join with audio only. Recordings include their audio.

!!! info
    Only Docker Compose is covered: the Helm chart does not deploy LiveKit SIP.

```
Phone ──► PSTN ──► SIP Trunk ──► LiveKit SIP Bridge ──► LiveKit Room
```

The PSTN is the public phone network, and SIP the protocol phone providers use to set up calls.

## Prerequisites

- A SIP trunk from a VoIP provider such as [Twilio](https://www.twilio.com/docs/sip-trunking), [Vonage](https://developer.vonage.com/en/sip/overview) or [Infobip](https://www.infobip.com/docs/voice-and-video/sip-trunking), or a self-hosted [Asterisk](https://www.asterisk.org/) or [FreeSWITCH](https://signalwire.com/freeswitch).
- A phone number from that provider.
- The ports of the [firewall table](firewall.md) marked for telephony.
- LiveKit's [webhook](livekit.md#webhook) to Meet, which the [Deployment Guide](../compose/deployment-guide.md#stack-3-meet-core) already sets.

## Meet backend

Add to `env.d/common`:

```dotenv
ROOM_TELEPHONY_ENABLED=True
ROOM_TELEPHONY_PHONE_NUMBER=+33123456789
ROOM_TELEPHONY_DEFAULT_COUNTRY=FR
```

If `ROOM_TELEPHONY_PHONE_NUMBER` is missing or cannot be parsed with `ROOM_TELEPHONY_DEFAULT_COUNTRY`, Meet shows no dial-in number and the backend logs a warning. Every other variable and default is in [Environment Variables: Telephony](../../reference/env-variables.md#telephony).

```bash
docker compose up -d --force-recreate backend
```

## LiveKit SIP service

Create `livekit-sip.yaml`. `<your LiveKit API secret>` is `LIVEKIT_API_SECRET`, from `env.d/common` on Docker Compose or the `meet-backend-env` Secret on Kubernetes.

```yaml
api_key: meet
api_secret: <your LiveKit API secret>
ws_url: ws://livekit:7880

redis:
  address: redis:6379
```

Add the service under `services:` in `compose.yml`. Its `ports:` are LiveKit SIP's [default](https://github.com/livekit/sip#config) `sip_port` and `rtp_port`, the telephony rows of the [firewall table](firewall.md):

```yaml
  livekit-sip:
    image: livekit/sip:latest
    restart: unless-stopped
    environment:
      SIP_CONFIG_FILE: /sip-config.yaml
    volumes:
      - ./livekit-sip.yaml:/sip-config.yaml:ro
    ports:
      - "5060:5060/udp"
      - "10000-20000:10000-20000/udp"
    depends_on:
      - redis
      - livekit
    networks:
      - internal
```

```bash
docker compose up -d livekit-sip
```

## Inbound SIP trunk

The trunk tells LiveKit SIP which calls to accept. Save it as `inbound-trunk.json`, with the number of `ROOM_TELEPHONY_PHONE_NUMBER`:

```json
{
  "trunk": {
    "name": "Main dial-in number",
    "numbers": ["+33123456789"],
    "allowed_addresses": ["<your provider's signalling IP or CIDR range>"]
  }
}
```

`allowed_addresses` takes IP addresses or CIDR ranges, not hostnames; an empty list accepts calls from any address.

Create the trunk once with the [LiveKit CLI](https://github.com/livekit/livekit-cli), `lk`, with the same secret:

```bash
lk sip inbound create \
  --url https://livekit.example.com \
  --api-key meet \
  --api-secret <your LiveKit API secret> \
  inbound-trunk.json
```

## No dispatch rule to create

Meet creates and deletes each room's dispatch rule itself, as [How do phone calls join?](../../overview/how-meet-works.md#agents-and-phone-calls) shows. Callers other than [Roomkit](../../reference/env-variables.md#roomkit-meeting-room-sip-devices) devices can therefore join only while someone is connected from a browser.

## SIP provider setup (Twilio example)

1. Create a Twilio account and obtain a phone number.
2. In the Twilio console, create a SIP Trunk.
3. Point the origination URI at your LiveKit SIP service: `sip:livekit.example.com:5060`, the address of the server running LiveKit SIP.

## Audio prompt language

LiveKit SIP speaks its prompts, the PIN prompt among them, in English. For another language, mount that language's audio files from its [`res` directory](https://github.com/livekit/sip/tree/main/res) as a volume on the `livekit-sip` service.

## Test a call

Join a room from a browser, call `ROOM_TELEPHONY_PHONE_NUMBER`, and enter the PIN shown after **Code:** in the **Meeting information** panel. When the call fails, see [Telephony issues](../../reference/troubleshooting.md#telephony-issues).

## Limitations

- Dial-in only: Meet does not implement calling out.
- Meet displays a single dial-in number, `ROOM_TELEPHONY_PHONE_NUMBER`.
