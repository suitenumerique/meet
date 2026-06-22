# LiveKit Integration

This page explains how Meet integrates with LiveKit at both the backend (Python) and frontend (TypeScript) levels.

## Overview

LiveKit integration has two sides:

1. **Backend (Python)**: Generates JWT tokens, calls LiveKit API for room management and Egress
2. **Frontend (TypeScript)**: Connects to LiveKit for media using the LiveKit React SDK

## Backend integration

### Python SDK

```toml
# pyproject.toml
[project.dependencies]
livekit-api = ">=0.7"
```

### Configuration

```python
# meet/settings.py
LIVEKIT_CONFIGURATION = {
    "api_key": ...,      # LIVEKIT_API_KEY env var
    "api_secret": ...,   # LIVEKIT_API_SECRET env var
    "url": ...,          # LIVEKIT_API_URL env var - returned to clients
}
```

### Token generation

```python
from livekit import api
from django.conf import settings

def generate_livekit_token(user, room_slug: str, is_owner: bool) -> str:
    grants = api.VideoGrants(
        room_join=True,
        room=room_slug,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
        room_admin=is_owner,
    )

    return (
        api.AccessToken(
            settings.LIVEKIT_CONFIGURATION["api_key"],
            settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        .with_identity(str(user.id))
        .with_name(user.name)
        .with_grants(grants)
        .to_jwt()
    )
```

The generated token and the `LIVEKIT_CONFIGURATION["url"]` are returned to the client together:

```python
# core/api/viewsets.py
return Response({
    "token": token,
    "url": settings.LIVEKIT_CONFIGURATION["url"],
})
```

### LiveKit server API calls

For administrative operations (kick participants, start Egress, list rooms):

```python
from livekit import api

async def start_recording(room_slug: str) -> str:
    lk = api.LiveKitAPI(
        url=settings.LIVEKIT_CONFIGURATION["url"],
        api_key=settings.LIVEKIT_CONFIGURATION["api_key"],
        api_secret=settings.LIVEKIT_CONFIGURATION["api_secret"],
    )
    response = await lk.egress.start_room_composite_egress(
        api.RoomCompositeEgressRequest(
            room_name=room_slug,
            file_outputs=[api.EncodedFileOutput(
                file_type=api.EncodedFileType.MP4,
                filepath=f"recordings/{uuid4()}.mp4",
                s3=api.S3Upload(
                    bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    ...
                ),
            )],
        )
    )
    return response.egress_id
```

### LiveKit webhook

LiveKit sends POST webhooks on room events. The endpoint is:
```
POST /api/v1.0/rooms/webhooks-livekit/
```

The backend verifies the webhook signature before processing:

```python
from livekit.api import WebhookReceiver

receiver = WebhookReceiver(api_key, api_secret)
event = receiver.receive(body, auth_token)
```

## Frontend integration

### Connection flow

```typescript
// 1. Get token from backend - the token is returned as part of the room GET response
// GET /api/v1.0/rooms/{id}/ → response.livekit.token + response.livekit.url
const room = await getRoom(roomId);
const { token, url } = room.livekit;

// 2. Connect (handled by LiveKitRoom component)
<LiveKitRoom token={token} serverUrl={url} connect>
  ...
</LiveKitRoom>
```

### Media controls

```typescript
import { useLocalParticipant } from '@livekit/components-react';

const { localParticipant } = useLocalParticipant();

// Toggle camera
await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);

// Toggle microphone
await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
```

### Data channels (chat)

In-meeting chat uses LiveKit Data Channels:

```typescript
import { useDataChannel } from '@livekit/components-react';

// Receive
const { message } = useDataChannel('chat', (msg) => {
  const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
  addChatMessage(decoded);
});

// Send
const { send } = useDataChannel('chat');
send(new TextEncoder().encode(JSON.stringify({
  text: 'Hello',
  sender: localParticipant.identity,
  timestamp: Date.now(),
})));
```

### Room events

```typescript
import { RoomEvent } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';

const room = useRoomContext();

useEffect(() => {
  room.on(RoomEvent.ParticipantConnected, (p) => console.log(`${p.identity} joined`));
  room.on(RoomEvent.RecordingStatusChanged, (isRecording) => setRecording(isRecording));
  return () => room.removeAllListeners();
}, [room]);
```

## LiveKit Agents

The metadata collector (`src/agents/metadata_collector.py`) uses the LiveKit Python Agents SDK to connect to rooms as a silent participant:

```python
from livekit import agents, rtc

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    @ctx.room.on("track_subscribed")
    def on_track(track, publication, participant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            # attach VAD to collect speaking events
            pass
```

## Testing LiveKit integration

For unit tests, mock the LiveKit API at the boundary:

```python
from unittest.mock import patch, AsyncMock

@patch('core.api.viewsets.api.LiveKitAPI')
async def test_get_room_with_token(mock_lk, client):
    mock_lk.return_value = AsyncMock()
    response = await client.get(f'/api/v1.0/rooms/{room.id}/')
    assert response.status_code == 200
    assert 'livekit' in response.json()
    assert 'token' in response.json()['livekit']
```

For integration tests, the development Docker Compose stack runs a real LiveKit server in `--dev` mode.
