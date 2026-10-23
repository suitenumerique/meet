# Settings

Configure your devices, preferences, and notifications via the settings modal. Device and preference settings are stored in your browser's local storage, so they stay on that browser; your profile and your default room settings are saved to your account.

![Settings page](../assets/settings-page.png)

## Profile

Displays your current login status and username. You can update your display name here.

- **Your name**: Set your display name shown in meetings. Cannot be empty.

## General

- **Leave calls with no participants**: Automatically leave a call after a few minutes if no other participant is present.
- **Automatically mute my microphone**: Mute your microphone automatically when joining a large meeting, to reduce background noise.

## Audio

### Microphone

Select your audio input device from the dropdown.

### Advanced voice optimization

⚗️ Beta. Toggle **Advanced voice optimization** to enable or disable noise suppression for your microphone.

### Speakers

Select your audio output device from the dropdown.

> Speaker selection is not available in Safari.

## Video

### Camera

Select your video input device from the dropdown.

### Resolution

Configure video quality for sending and receiving:

**Publishing (sending):**
- Very high definition (1080p)
- High definition (720p)
- Standard definition (360p)
- Low definition (180p)

**Subscribing (receiving):**
- High definition (auto)
- Standard definition
- Low definition

## Transcription

- **Meeting language**: Set the default language for AI transcription: French, English, Dutch, German, or Auto.

## Rooms

**Default room settings** apply to the new rooms you create: who can join them, and what participants may publish. They are saved to your account, and each meeting can still change them from its host settings.

## Notifications

Toggle sound notifications on or off for each event:

- **Participant joined**: Sound when a new participant joins
- **Hand raised**: Sound when someone raises their hand
- **Message received**: Sound when a chat message is received
- **Participant waiting**: Sound when a participant is waiting in the lobby

## Shortcuts

Press `Ctrl+Shift+/` to open the shortcuts panel and view all available keyboard shortcuts.

## Language

Set the interface language. Supported languages: French, English, Dutch, German, and Spanish. The default depends on your instance's `DJANGO_LANGUAGE_CODE` setting (typically English for self-hosted deployments).
