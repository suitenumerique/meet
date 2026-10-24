# Frequently Asked Questions

## Joining

### Do I need to install anything?

No. Meet runs in a recent Chrome, Firefox, Safari or Edge, on a computer or a phone. A mobile app in beta, not officially supported, is at [github.com/mmaudet/visio-mobile](https://github.com/mmaudet/visio-mobile).

### Do I need an account?

Not to join an **Open** room through its link. Other rooms can make you wait until someone admits you, see [Access levels](user/features-controls.md#access-levels). Where your instance allows it, **Create a meeting** also starts a meeting while you are signed out, one that no one owns, see [Start a meeting](user/getting-started.md#start-a-meeting).

### Why does the link say the meeting has been deleted?

Its owner deleted the room, and its link cannot open a meeting any more, see [Deleted rooms](user/features-controls.md#deleted-rooms). Ask them for a new link.

### Why am I stuck in the waiting room?

Someone has to admit you: the room's owner or a co-host, or, in a room open to trusted people, any signed-in participant already in the meeting. They see a pop-up, and you in the **Lobby** section of the participants panel (**See everyone**).

### How many people can join, and for how long?

Meet runs meetings of 150 and more in production, with no cap of its own: the limit is the media server's capacity. There is no time limit; the meeting lasts until the last person leaves, see [When the meeting ends](overview/how-meet-works.md#when-the-meeting-ends).

## Audio, video and screen

### My microphone or camera does not work

1. Allow the browser to use them: click the camera icon in the address bar
2. Pick the right device in **Settings → Audio** or **Settings → Video**
3. Close any other application using the device, then reload the page

### My audio echoes

Someone's speakers are feeding back into their microphone, usually not yours: echo cancellation is always on for your own. Ask whoever echoes to use headphones or lower their volume.

### Others sound choppy

Usually a network problem on one side: close bandwidth-heavy tabs and apps, move closer to the Wi-Fi router, or ask the choppy participant to check their connection.

### How do I check my connection before a meeting?

Click **Test your configuration** in the page footer, where your instance offers it, then **Run test**. It checks your browser, camera, microphone and network in about a minute. **Suboptimal connection** means your network blocks the direct route, so the call goes through a relay over TCP or TLS. You can join, but quality may drop. Your IT department can open the ports that avoid it, see [Firewall & Ports](self-hosting/configuration/firewall.md).

### I cannot share my screen

On macOS, allow your browser in **System Settings → Privacy & Security → Screen Recording**.

### Which codecs does Meet use?

Opus for audio. Video uses the codec your instance sets, VP9 by default, or VP8, H.264 or AV1, see [`LIVEKIT_DEFAULT_VIDEO_CODEC`](reference/env-variables.md#livekit). Recordings use H.264 and AAC.

## Recording and transcription

### How do I know a meeting is being recorded?

A red indicator shows for everyone while a recording runs.

### Who gets the recording, and for how long?

Whoever started it, and the room's owner and co-hosts, see [Recording](user/recording.md#recording). Whoever runs your instance can also reach the file in its storage. How long the file is kept is your instance's choice, see [What is stored where](overview/how-meet-works.md#what-is-stored-where).

### Why don't I see the recording or transcription buttons?

If **More tools** has no **Record** or **Transcribe**, your instance has not set them up. If they show but you cannot start them, sign in: in an **Open** room or one open to trusted people, any signed-in participant can start them, unless your instance turns that off. In other rooms only the owner and co-hosts can; click **Request** and they are notified.

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
