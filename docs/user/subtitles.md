# Real-time Subtitles

Real-time subtitles provide live captions during meetings for accessibility. As participants speak, their words appear as text at the bottom of the screen for everyone to read.

## Requirements

- Real-time subtitles must be enabled on your instance (`ROOM_SUBTITLE_ENABLED=True`)
- The multi-user transcriber agent must be deployed and running
- An STT provider (Deepgram or Kyutai) must be configured

## Starting subtitles

When enabled on your instance, room owners and administrators can start real-time subtitles from the meeting controls.

Live captions appear at the bottom of the screen for all participants as people speak.

## How it works

The multi-user transcriber is a LiveKit agent that:

1. Joins the meeting as a silent participant
2. Subscribes to all participants' audio tracks
3. Sends audio to the configured STT provider (Deepgram or Kyutai)
4. Receives transcribed text in real-time
5. Publishes captions as LiveKit data messages
6. All participants see the captions displayed live

## Supported STT providers

- **Deepgram**: Cloud-based speech-to-text service with multilingual support
- **Kyutai**: Self-hosted Moshi model for on-premise deployments

## Configuration

This feature requires server-side configuration. Contact your instance administrator to enable it.

Administrator documentation: [Self-hosting configuration](../self-hosting/configuration/subtitles.md)

## Limitations

- Caption accuracy depends on audio quality and the STT provider
- Speaker identification is limited
- Internet connectivity issues may cause caption delays
