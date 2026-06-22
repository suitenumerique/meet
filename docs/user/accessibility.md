# Accessibility

LaSuite Meet is built with accessibility as a core requirement, not an afterthought. The team actively maintains WCAG compliance and regularly audits the interface with screen readers and keyboard-only navigation.

## Keyboard navigation

The entire interface is navigable by keyboard:

- **Tab** / **Shift+Tab**: Move between interactive elements
- **Enter** / **Space**: Activate buttons and controls
- **Arrow keys**: Navigate within toolbars and panels
- **Escape**: Close dialogs and panels

A **skip link** appears at the top of the page on keyboard focus, allowing keyboard users to jump directly to the main content.

## Screen reader support

Meet uses semantic HTML and ARIA attributes throughout:

- All buttons have accessible names
- State changes (mute/unmute, recording start/stop) are announced via ARIA live regions
- Reactions sent by others are announced ("Antoine reacted with 👍")
- Participant join/leave events are announced
- The document title updates dynamically when connected to a meeting
- The HTML `lang` attribute updates with the selected language

Tested regularly with NVDA (Windows), JAWS (Windows), VoiceOver (macOS/iOS), and TalkBack (Android).

## Caption customization

When transcription is active, captions can be customized:

1. Go to **Settings → Accessibility**
2. Adjust:
   - **Font size**: Small / Medium / Large / Extra large
   - **Font family**: System default or dyslexia-friendly fonts
   - **Background color**: Transparent, dark, or custom color
   - **Text color**: White, black, or custom

## Reduced motion

Meet respects the `prefers-reduced-motion` media query. When this is active in your OS settings:

- Animated transitions are replaced by instant state changes
- Reaction animations are suppressed
- Loading spinners use a static fallback

You can also manually enable reduced motion in **Settings → Accessibility** regardless of your OS setting.

## High contrast

Meet respects the `prefers-contrast: more` media query and ensures all interactive elements meet WCAG AA contrast requirements. Selected states, focus rings, and disabled states are clearly distinguishable.

## Focus management

- Opening a dialog moves focus inside it
- Closing a dialog returns focus to the trigger element
- The reactions toolbar can be focused with `Ctrl+Shift+E` and navigated with arrow keys
- The side panel (chat, participants, transcript) has keyboard-accessible navigation

## Keyboard shortcuts

A dedicated shortcuts panel is available at `Ctrl+Shift+/`. For the full list, see [Keyboard Shortcuts](keyboard-shortcuts.md).

## Reporting accessibility issues

If you encounter an accessibility barrier, please open an issue on [GitHub](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) with the label `accessibility`. Include:

- Browser and assistive technology version
- Steps to reproduce
- Expected vs. actual behavior
