# Frequently Asked Questions

## Joining

### Do I need to install anything?

No. Meet runs in a recent Chrome, Firefox, Safari or Edge, on a computer or a phone, with the differences listed in [Browser support](user/features-controls.md#browser-support). A mobile app in beta, not officially supported, is at [github.com/mmaudet/visio-mobile](https://github.com/mmaudet/visio-mobile).

### Do I need an account?

- Not to join an **Open** room through its link. Other rooms may make you wait until someone admits you, see [Access levels](user/features-controls.md#access-levels).
- Where your Meet server allows it, you can also start a meeting without signing in, though no one will own it, see [Start a meeting](user/getting-started.md#start-a-meeting).

### Why does the link say the meeting has been deleted?

Its owner deleted the room, see [Deleted rooms](user/features-controls.md#deleted-rooms). Ask them for a new link.

### Why am I stuck in the waiting room?

Someone already in the meeting has to admit you. [Permissions](user/features-controls.md#permissions) lists who can.

### How many people can join, and for how long?

- People: Meet sets no cap and is built for meetings of more than 100; the limit is the media server's capacity.
- Time: no limit. The meeting lasts until the last person leaves, see [When the meeting ends](overview/how-meet-works.md#when-the-meeting-ends).

## Audio, video and screen

### My microphone or camera does not work

1. Allow the browser to use them, from the site settings in its address bar
2. Pick the right device in **Settings → Audio** or **Settings → Video**
3. Close any other application using the device, then reload the page

### My audio echoes

The echo comes from someone else's speakers feeding back into their microphone, since Meet always cancels echo on yours. Ask them to use headphones or lower their volume.

### Others sound choppy

Usually a network problem on one side. Close bandwidth-heavy tabs and apps, move closer to the Wi-Fi router, or ask the choppy participant to check their connection.

### How do I check my connection before a meeting?

Click **Test your configuration** in the page footer, where your Meet server offers it, then **Run test**.

- **Suboptimal connection**: your network blocks the direct route. You can join, but quality may drop.
- Your IT department can open the ports that fix it, see [Firewall & Ports](self-hosting/configuration/firewall.md).

### I cannot share my screen

Phones cannot share their screen, see [Browser support](user/features-controls.md#browser-support). On macOS, allow your browser to record the screen in **System Settings → Privacy & Security**.

## Recording and transcription

### Who gets the recording, and for how long?

- Whoever started it, and the room's owner and co-hosts, see [Recording](user/recording.md#recording). Whoever runs your Meet server can also reach the file.
- How long it is kept is up to whoever runs your Meet server, see [What is stored where](overview/how-meet-works.md#what-is-stored-where).

### Why don't I see the recording or transcription buttons?

- Not in **More tools**: your Meet server has not set them up.
- Shown but you cannot start them: you lack the right in this room, see [Permissions](user/features-controls.md#permissions). Signing in is often enough; otherwise click **Request**: everyone in the meeting is notified, and someone allowed to start it can do so.

## Security and privacy

### Are meetings encrypted?

Every stream is encrypted between your browser and the media server (DTLS-SRTP, the WebRTC standard). Meet has no end-to-end encryption: the media server can read the streams it forwards.

### Is chat history stored?

No, unless a transcription is running and your Meet server collects its metadata, see [What is stored where](overview/how-meet-works.md#what-is-stored-where).

## Hosting and contributing

### Can I run my own instance?

Yes, with your own LiveKit media server beside it and any standard OpenID Connect provider for sign-in. See [Self-Hosting](self-hosting/index.md).

### How do I contribute or report a bug?

Start with [Develop locally](contributing/develop.md), [open an issue](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) for a bug, and see where Meet is heading on the [roadmap](https://github.com/orgs/suitenumerique/projects/3/views/2).
