# Telephony Integration

LaSuite Meet supports telephony integration via LiveKit's SIP bridge, allowing participants to join meetings by phone or connecting Meet rooms to PSTN (public telephone network) systems.

!!!info
    This guide applies to both Docker Compose and Kubernetes deployments. The `compose.yml` snippets below are ready to use with a Docker Compose setup.

## Use cases

- **Dial-in**: Phone users call a number to join a meeting
- **Dial-out**: The system calls a phone number to bring a PSTN participant into a room
- **PBX integration**: Connect Meet to your organization's PBX or UCaaS system

## Architecture

```
Phone ──► PSTN ──► SIP Trunk ──► LiveKit SIP Bridge ──► LiveKit Room
```

LiveKit's SIP component handles SIP signaling and audio transcoding between the PSTN world (G.711/G.722 audio, SIP protocol) and the WebRTC world (Opus audio, WebRTC protocol).

## Prerequisites

- LiveKit server 1.5+ with SIP enabled
- A SIP trunk from a VoIP provider (Twilio, Vonage, Infobip, or a self-hosted Asterisk/FreeSWITCH)
- SIP credentials (username, password, server address)
- A phone number (DID) from your VoIP provider

## Enabling SIP in LiveKit

First, enable telephony in your Meet backend by adding to `.env`:

```dotenv
ROOM_TELEPHONY_ENABLED=True
```

Then add SIP configuration to your `livekit-server.yaml`:

```yaml
sip:
  enabled: true
```

LiveKit SIP also requires its own service. Add to `compose.yml`:

```yaml
livekit-sip:
  image: livekit/sip:latest
  environment:
    SIP_CONFIG_FILE: /sip-config.yaml
  volumes:
    - ./livekit-sip.yaml:/sip-config.yaml
  ports:
    - "5060:5060/udp"   # SIP signaling
    - "10000-20000:10000-20000/udp"  # RTP media
  depends_on:
    - redis
    - livekit
```

## SIP service configuration

Create `livekit-sip.yaml`:

```yaml
api_key: myapikey
api_secret: your-livekit-api-secret
ws_url: ws://livekit:7880

redis:
  address: redis:6379

sip:
  port: 5060
```

## Configuring SIP trunks

SIP trunks are configured via the LiveKit API. The examples below use `curl` directly , no extra tools required.

### Inbound trunk (for dial-in)

Via the LiveKit API:

```json
POST /twirp/livekit.SIP/CreateSIPInboundTrunk
{
  "trunk": {
    "numbers": ["+33123456789"],
    "allowed_addresses": ["sip.twilio.com"],
    "name": "Main dial-in number"
  }
}
```

### Outbound trunk (for dial-out)

```json
POST /twirp/livekit.SIP/CreateSIPOutboundTrunk
{
  "trunk": {
    "address": "sip.twilio.com",
    "auth_username": "your-twilio-account-sid",
    "auth_password": "your-twilio-auth-token",
    "name": "Outbound via Twilio"
  }
}
```

## Dispatch rules

**Dispatch rules are managed automatically by Meet**: no manual configuration needed.

When a room is created, Meet's backend receives a `room_started` webhook from LiveKit and automatically creates a PIN-based SIP dispatch rule for that room. When the room ends, the dispatch rule is automatically cleared.

The PIN code is displayed to participants in the room info panel (left sidebar). Callers dial the configured phone number, enter the PIN, and are connected to the room.

!!!info
    **Requirement**: LiveKit webhooks must be configured to reach the Meet backend for dispatch rules to be created. See [Recording: Step 7](recording.md#step-7-configure-livekit-webhook) for webhook setup; the same configuration is required for telephony.

    **Current limitation**: A phone participant cannot enter the room until at least one WebRTC participant has already connected.

## SIP provider setup (Twilio example)

1. Create a Twilio account and obtain a phone number
2. In Twilio console, create a SIP Trunk
3. Configure the origination URI to point to your LiveKit SIP service: `sip:your-server.example.com:5060`
4. Use your Twilio account SID and auth token as the outbound trunk credentials

## Firewall requirements

SIP and RTP require additional open ports:

| Port | Protocol | Purpose |
|---|---|---|
| 5060 | UDP | SIP signaling |
| 10000-20000 | UDP | RTP media (SIP audio) |

!!!info 
    The RTP port range (10000-20000) must be open for telephony to work. This is in addition to LiveKit's standard WebRTC ports.

## Audio quality notes

SIP telephone calls use narrowband audio (G.711, 8 kHz). This is noticeably lower quality than WebRTC participants (Opus, 48 kHz). LiveKit transcodes between the two transparently, but phone participants will always sound like a phone call.

## Testing telephony

To dial out to a phone from a room, call the LiveKit SIP API:

```json
POST /twirp/livekit.SIP/CreateSIPParticipant
{
  "sip_trunk_id": "<outbound-trunk-id>",
  "sip_call_to": "+33612345678",
  "room_name": "my-room",
  "participant_identity": "phone-participant"
}
```

## Limitations

- A phone participant cannot enter the room until at least one WebRTC participant has connected
- Only a single SIP trunk provider is supported per instance
- SIP participants are audio-only (no video)
- Reactions, chat, and screen sharing are not available to SIP participants
- Recording will capture SIP audio alongside WebRTC participants
- The RTP port range (10000-20000) is large; open it only if you actually use telephony

## Telephony in the UI

When telephony is configured, the meeting room's info panel (left sidebar) shows the dial-in phone number and a PIN code for the room. Participants can call the number, enter the PIN, and join as audio-only attendees.

## Troubleshooting

**No audio from phone participant**: Verify the RTP port range (10000-20000 UDP) is open in your firewall. This is the most common cause.

**SIP call fails to connect**: Check that the origination URI in your SIP provider's console points to your LiveKit SIP service's host on port 5060. Verify no firewall is blocking UDP 5060.

**Wrong room or no dispatch rule matched**: Ensure a dispatch rule is configured for the inbound trunk. Without a rule, calls are rejected.
