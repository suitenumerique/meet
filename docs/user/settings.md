# Settings

Configure your devices, preferences, and notifications via the settings modal. These settings are stored in your browser's local storage and persist across sessions.

![Settings page](../assets/settings-page.png)

## Account

Displays your current login status and username. You can update your display name here.

- **Your name**: Set your display name shown in meetings. Cannot be empty.

## Preferences

- **Auto-leave when alone**: Automatically leave a call after a few minutes if no other participant is present.
- **Automatically mute when joining a large meeting**: Mute your microphone automatically when entering a large room to reduce background noise.

## Audio

### Microphone

Select your audio input device from the dropdown.

### Noise reduction

⚗️ Beta. Toggle **Noise reduction** to enable or disable noise suppression for your microphone.

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

## Sound notifications

Toggle sound notifications on or off for each event:

- **Participant joined**: Sound when a new participant joins
- **Hand raised**: Sound when someone raises their hand
- **Message received**: Sound when a chat message is received
- **Participant waiting**: Sound when a participant is waiting in the lobby

## Keyboard shortcuts

Press `Ctrl+Shift+/` to open the shortcuts panel and view all available keyboard shortcuts.

## Language

Set the interface language. Supported languages: French, English, Dutch, German, and Spanish. The default depends on your instance's `LANGUAGE_CODE` setting (typically English for self-hosted deployments).
