# Frequently Asked Questions

## Joining

### Do I need to install anything?

No. Meet runs in a recent Chrome, Firefox, Safari or Edge, on a computer or a phone. A mobile app in beta, not officially supported, is at [github.com/mmaudet/visio-mobile](https://github.com/mmaudet/visio-mobile).

### Do I need an account?

- Not to join an **Open** room through its link. Other rooms may make you wait until someone admits you, see [Access levels](user/features-controls.md#access-levels).
- Where your instance allows it, you can also start a meeting signed out, one that no one owns, see [Start a meeting](user/getting-started.md#start-a-meeting).

### Why does the link say the meeting has been deleted?

Its owner deleted the room, see [Deleted rooms](user/features-controls.md#deleted-rooms). Ask them for a new link.

### Why am I stuck in the waiting room?

Someone already in the meeting has to admit you; who can is in [Permissions](user/features-controls.md#permissions).

### How many people can join, and for how long?

- People: Meet sets no cap and runs meetings of 150 and more in production; the limit is the media server's capacity.
- Time: no limit. The meeting lasts until the last person leaves, see [When the meeting ends](overview/how-meet-works.md#when-the-meeting-ends).

## Audio, video and screen

### My microphone or camera does not work

1. Allow the browser to use them: click the camera icon in the address bar
2. Pick the right device in **Settings → Audio** or **Settings → Video**
3. Close any other application using the device, then reload the page

### My audio echoes

Someone else's speakers are feeding back into their microphone; yours has echo cancellation always on. Ask them to use headphones or lower their volume.

### Others sound choppy

Usually a network problem on one side. Close bandwidth-heavy tabs and apps, move closer to the Wi-Fi router, or ask the choppy participant to check their connection.

### How do I check my connection before a meeting?

Click **Test your configuration** in the page footer, where your instance offers it, then **Run test**.

- **Suboptimal connection**: your network blocks the direct route. You can join, but quality may drop.
- Your IT department can open the ports that avoid it, see [Firewall & Ports](self-hosting/configuration/firewall.md).

### I cannot share my screen

On macOS, allow your browser in **System Settings → Privacy & Security → Screen Recording**.

### Which codecs does Meet use?

- Audio: Opus.
- Video: VP9 by default, or VP8, H.264 or AV1, set by [`LIVEKIT_DEFAULT_VIDEO_CODEC`](reference/env-variables.md#livekit).
- Recordings: H.264 and AAC.

## Recording and transcription

### How do I know a meeting is being recorded?

A red indicator shows for everyone while a recording runs.

### Who gets the recording, and for how long?

- Whoever started it, and the room's owner and co-hosts, see [Recording](user/recording.md#recording). Whoever runs your instance can also reach the file.
- How long it is kept is your instance's choice, see [What is stored where](overview/how-meet-works.md#what-is-stored-where).

### Why don't I see the recording or transcription buttons?

- Not in **More tools**: your instance has not set them up.
- Shown but you cannot start them: you lack the right in this room, see [Permissions](user/features-controls.md#permissions). Signing in is often enough; otherwise click **Request** to notify the owner and co-hosts.

## Security and privacy

### Are meetings encrypted?

Every stream is encrypted between your browser and the media server (DTLS-SRTP, the WebRTC standard). Meet has no end-to-end encryption: the media server can read the streams it forwards.

### Is chat history stored?

No. Messages sent while a transcription runs can be kept with it, see [What is stored where](overview/how-meet-works.md#what-is-stored-where).

## Hosting and contributing

### Can I run my own instance?

Yes, with your own LiveKit media server beside it and any standard OpenID Connect provider for sign-in. See [Self-Hosting](self-hosting/index.md).

### How do I contribute or report a bug?

Start with [Develop locally](contributing/develop.md), [open an issue](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) for a bug, and see where Meet is heading on the [roadmap](https://github.com/orgs/suitenumerique/projects/3/views/2).
