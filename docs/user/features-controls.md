# Features & Controls

![Features Tour](../assets/feature-tour.gif)

Everything you can do once inside a meeting, who can do it, and where to find it. Joining and the pre-join screen are in [Getting Started](getting-started.md). ⚗️ marks a beta feature.

## At a glance

![Meeting room](../assets/meeting-room.png)

### In the call

| Feature | Where | Who | Notes |
|---|---|---|---|
| Microphone, camera | <img src="../assets/icons/mic-line.svg" width="20" /> <img src="../assets/icons/video-on-line.svg" width="20" /> in the control bar; the <img src="../assets/icons/arrow-up-s-line.svg" width="20" /> beside each picks the device | Everyone | `Ctrl+D`, `Ctrl+E` |
| Push-to-talk | Hold `V` | Everyone | Unmutes while held |
| Pin a participant | Hover their tile → **Pin** | Everyone | The active speaker is highlighted automatically |
| Picture-in-picture | <img src="../assets/icons/more-fill.svg" width="20" /> **More options** → **Picture-in-picture** | Everyone | A floating window that stays visible over other tabs and applications |
| Backgrounds and effects | <img src="../assets/icons/arrow-up-s-line.svg" width="20" /> beside the camera, **More options**, or the pre-join screen | Everyone | Blur or an image. Uploading your own, up to 10 JPEG or PNG of 2 MB each, only where the instance allows it |
| Noise suppression ⚗️ | **Settings → Audio → Advanced voice optimization** | Everyone | |
| Video quality | **Settings → Video → Resolution** | Everyone | Up to 1080p |
| Leave | <img src="../assets/icons/phone-fill.svg" width="20" /> **Leave** | Everyone | The meeting goes on without you. There is no "end for all"; the room stays and can be reused |

### Talking together

| Feature | Where | Who | Notes |
|---|---|---|---|
| Screen sharing | <img src="../assets/icons/screen-share.svg" width="20" /> **Screen share** | Everyone, unless a host turns it off | Several at once. [Details](#screen-sharing) |
| Chat | <img src="../assets/icons/chat-1-line.svg" width="20" /> **Chat** | Everyone | Not kept after the meeting. [Details](#chat) |
| Reactions | <img src="../assets/icons/emotion-line.svg" width="20" /> **Reactions**, or `Ctrl+Shift+E` | Everyone | An emoji shown on your tile for a few seconds |
| Raise hand | <img src="../assets/icons/hand.svg" width="20" /> **Raise hand** | Everyone | Queued in order. [Details](#raised-hands) |
| Subtitles ⚗️ | <img src="../assets/icons/closed-captioning-line.svg" width="20" /> **Subtitles** | Everyone | Where the instance runs them. [Real-time Subtitles](subtitles.md) |
| Phone dial-in | The room info panel shows the number and PIN | Anyone with the PIN | Audio only. [Details](#phone-dial-in) |

### Hosting

| Feature | Where | Who | Notes |
|---|---|---|---|
| Room access level | <img src="../assets/icons/admin-line.svg" width="20" /> **Open admin** → **Host settings** | Owners, administrators | [Who gets in](#roles-and-access) |
| Admit from the waiting room | <img src="../assets/icons/group-line.svg" width="20" /> **Participants** → **Lobby**, or the pop-up | Owners, administrators | On trusted rooms, any signed-in participant |
| Make co-host | **Participants** → menu beside the name → **Make co-host** | Owners, administrators | Signed-in participants only |
| Mute someone | **Participants** → hover the name → **Mute** | Everyone, by default | Hosts can restrict it |
| Remove someone | **Participants** → hover the name → **Remove from the call** | Owners, administrators | They can rejoin unless the room is **Restricted** |
| Turn off screen sharing, muting others or video for participants | **Host settings** | Owners, administrators | [Permissions](#permissions) |

### Recording and AI

| Feature | Where | Who | Notes |
|---|---|---|---|
| Recording | **More options** → **Screen recording** | Owners, administrators | Everyone sees a red indicator; the download link goes to whoever started it. [Recording](recording.md) |
| Transcription ⚗️ | **More options** → **Transcription** | Owners, administrators | Choose the language first; can start a recording too. [AI Transcription](transcription.md) |

### Accessibility

Keyboard-only use, screen readers, caption styling, reduced motion and high contrast are covered in [Accessibility](accessibility.md); every shortcut is in [Keyboard Shortcuts](keyboard-shortcuts.md), or press `Ctrl+Shift+/` in a meeting.

### Set up by your administrator

These appear only where the instance enables them.

| Feature | Status | Set up in |
|---|---|---|
| Recording | Available | [Recording](../self-hosting/configuration/recording.md) |
| Transcription and AI summary | ⚗️ Beta | [AI Transcription](../self-hosting/configuration/transcription.md) |
| Real-time subtitles | ⚗️ Beta | [Real-time Subtitles](../self-hosting/configuration/subtitles.md) |
| Phone dial-in | Available | [Telephony](../self-hosting/configuration/telephony.md) |
| Uploaded backgrounds | Off by default | `FILE_UPLOAD_ENABLED`, [Environment Variables](../reference/env-variables.md) |
| Branding | Available | [Theming](../self-hosting/configuration/theming.md) |
| Meeting-room devices (Roomkit) | ⚗️ Beta, off by default | [Environment Variables](../reference/env-variables.md#roomkit-meeting-room-sip-devices) |
| Outlook add-in, other applications | Available | [API reference](../reference/api.md) |
| End-to-end encryption | 🔜 In development | |

## Roles and access

### Roles

A room's access list gives each person one role:

| Role | Who |
|---|---|
| **Owner** | Whoever created the room, with **Start an instant meeting** or **Create a meeting for a later date** |
| **Administrator** | Shown as **Co-host** in the meeting. Owners and administrators give it to a signed-in participant from the **Participants** panel |
| **Member** | Granted through the API, as are roles for people not in the meeting, see [Room Access & Roles](../reference/api.md#room-access-roles) |

Email invitations, also sent through the API, carry a join link and no role.

### Permissions

| Action | Owner | Administrator | Member |
|---|---|---|---|
| Start or stop recording and transcription | ✅ | ✅ | ❌ |
| Change room settings and access level | ✅ | ✅ | ❌ |
| Admit from the waiting room | ✅ | ✅ | ❌ † |
| Remove participants | ✅ | ✅ | ❌ |
| Mute others | ✅ | ✅ | ✅ * |
| Share screen | ✅ | ✅ | ✅ * |
| Chat, react, raise hand | ✅ | ✅ | ✅ |
| Delete the room | ✅ | ❌ | ❌ |

\* By default. Owners and administrators can turn **Mute others** and **Share their screen** off in the host settings.

† In a room open to trusted people, any signed-in participant in the meeting can admit.

No one can turn off a single participant's camera: **Enable video** in the host settings turns off video for everyone who is not an owner or administrator.

### Access levels

| Access level | Joins directly | Requests entry |
|---|---|---|
| **Open** | Anyone with the link | No one |
| **Open to trusted people** | Signed-in users | Everyone else |
| **Restricted** | People with a role on the room | Everyone else |

People requesting entry appear under **Participants → Lobby**, and a pop-up tells the host someone is waiting. **Remove from the call** only disconnects someone: they can reopen the link, so keeping them out takes **Restricted**.

## Screen sharing

Your browser asks what to share: the entire screen, a window, or a browser tab. Sharing a tab can also share its sound: tick **Share tab audio** in that dialog. Sound from a window or the whole screen depends on the browser: Chrome on Windows shares system audio, Firefox and Safari do not.

To stop, click **Screen share** again or the browser's **Stop sharing** bar. Turning off **Share their screen** in the host settings also stops the shares in progress. Recordings capture every active share, in the layout participants see.

## Chat

![Chat panel](../assets/chat-panel.png)

Messages go to everyone in the meeting; there are no private messages. A dot on the **Chat** icon shows unread messages while the panel is closed, and screen readers announce new ones.

Nothing is kept once the last participant leaves, with one exception: during a transcription on an instance that runs the metadata collector, messages are saved with the transcription metadata, see [FAQ](../faq.md#is-chat-history-stored).

## Raised hands

A raised hand puts a mark on your tile and you in a queue, in the order hands went up, visible to everyone. Click **Raise hand** again to lower it. If you start speaking with your hand up, it is lowered for you, unless you click **Keep hand raised**.

## Phone dial-in

Open the room info panel to see the number and the room's PIN, dial it, and enter the PIN. You join as audio only: no video, screen sharing, reactions or chat, and you appear in the participants panel. A phone caller cannot join before someone has joined from a browser. If the panel shows no number, the instance has no telephony.
