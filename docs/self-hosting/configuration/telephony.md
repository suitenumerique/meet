# Telephony Integration

Participants can join a meeting by phone through LiveKit's SIP bridge. SIP is the protocol phone providers use to set up calls. The room's info panel shows the dial-in number and the room's PIN; a caller dials the number, enters the PIN and joins as an audio-only participant.

!!!info
    Only Docker Compose is covered; the Helm chart does not deploy LiveKit SIP.

## Architecture

```
Phone ──► PSTN ──► SIP Trunk ──► LiveKit SIP Bridge ──► LiveKit Room
```

The PSTN is the public phone network. LiveKit's SIP component handles SIP signalling and converts audio between the phone network, usually G.711 (8 kHz), and WebRTC (Opus, 48 kHz). Phone participants therefore sound like a phone call. Recordings include their audio.

## Prerequisites

- A SIP trunk from a VoIP provider (Twilio, Vonage, Infobip), or a self-hosted Asterisk or FreeSWITCH.
- A phone number (DID) from that provider.
- The ports of the [firewall table](firewall.md) marked for telephony.
- The LiveKit webhook to Meet, which the base setup already configures: see the [Deployment Guide](../compose/deployment-guide.md#stack-3-meet-core).

## Meet backend

Add to `env.d/common`:

```dotenv
ROOM_TELEPHONY_ENABLED=True
ROOM_TELEPHONY_PHONE_NUMBER=+33123456789
ROOM_TELEPHONY_DEFAULT_COUNTRY=FR
```

If `ROOM_TELEPHONY_PHONE_NUMBER` is missing or cannot be parsed with `ROOM_TELEPHONY_DEFAULT_COUNTRY`, `/api/v1.0/config/` reports telephony disabled and the backend logs a warning. The other variables and every default are in [Environment Variables: Telephony](../../reference/env-variables.md#telephony).

```bash
docker compose up -d --force-recreate backend
```

## LiveKit SIP service

Create `livekit-sip.yaml`:

```yaml
api_key: meet
api_secret: <your LiveKit API secret>
ws_url: ws://livekit:7880

redis:
  address: redis:6379
```

Add the service to `compose.yml`, under `services:`. Its `ports:` publish LiveKit SIP's [default](https://github.com/livekit/sip#config) `sip_port` and `rtp_port`, the telephony rows of the [firewall table](firewall.md):

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

The trunk tells LiveKit SIP which calls to accept. Create it once with the [LiveKit CLI](https://github.com/livekit/livekit-cli), `lk`. Save this as `inbound-trunk.json`, with the number of `ROOM_TELEPHONY_PHONE_NUMBER`:

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

```bash
lk sip inbound create \
  --url https://livekit.example.com \
  --api-key meet \
  --api-secret <your LiveKit API secret> \
  inbound-trunk.json
```

## Dispatch rules

Meet manages dispatch rules itself. When the first participant joins, LiveKit sends `room_started` and Meet creates a dispatch rule routing the room's PIN to it. On `room_finished` the rule is deleted. A caller can therefore join only while someone is connected from a browser, except Roomkit devices (see [Roomkit](../../reference/env-variables.md#roomkit-meeting-room-sip-devices) in the Environment Variables reference).

## SIP provider setup (Twilio example)

1. Create a Twilio account and obtain a phone number.
2. In the Twilio console, create a SIP Trunk.
3. Point the origination URI at your LiveKit SIP service: `sip:your-server.example.com:5060`.

## Audio prompt language

LiveKit SIP speaks its prompts, the PIN prompt among them, in English. For another language, mount that language's audio files as a volume on the `livekit-sip` service. The audio files are in [github.com/livekit/sip/tree/main/res](https://github.com/livekit/sip/tree/main/res).

## Testing telephony

Join a room from a browser, call `ROOM_TELEPHONY_PHONE_NUMBER`, and enter the PIN shown in the room info panel. When the call fails, see [Telephony issues](../../reference/troubleshooting.md#telephony-issues).

## Limitations

- Dial-in only: Meet does not implement calling out.
- Meet displays a single dial-in number (`ROOM_TELEPHONY_PHONE_NUMBER`).
