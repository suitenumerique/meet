# Frontend Development

The Meet frontend is a TypeScript/React SPA built with Vite.

## Tech stack

| Component | Technology |
|---|---|
| Framework | React 18 |
| Language | TypeScript |
| Build tool | Vite |
| WebRTC | livekit-client |
| Headless UI components | React Aria (Adobe) |
| State management | Valtio |
| Data fetching | TanStack Query |
| i18n | i18next |
| Linting | ESLint + Prettier |

## Running in dev mode

```bash
# Start backend services
make run-backend

# Install and start the frontend dev server
make frontend-development-install
make run-frontend-development

# Or directly
cd src/frontend
npm install
npm run dev
```

Dev server runs at http://localhost:3000 with hot module replacement.

## Project structure

```
src/frontend/src/
├── api/              # Typed fetch wrappers for backend endpoints
├── components/       # Shared/reusable components
├── features/         # One directory per feature (rooms, chat, recording, participants, …)
├── hooks/            # Custom React hooks
├── stores/           # Valtio state stores
├── i18n/ | locales/  # Translation setup and JSON files
└── App.tsx           # Root component + routing
```

See `src/frontend/src/features/` for the current list of features — this is not duplicated here as it changes frequently.

## LiveKit connection

The room component wraps `<LiveKitRoom>` from `@livekit/components-react`, passing the `token` and `serverUrl` obtained from the room API response (`GET /api/v1.0/rooms/{id}/` → `livekit.token` / `livekit.url`).

See [`features/rooms/components/Conference.tsx`](../../src/frontend/src/features/rooms/components/Conference.tsx) for the actual setup, which also handles things like connect gating, background processors, and browser-specific workarounds — details not reproduced here to avoid drift.

## State management

Global/cross-feature state uses [Valtio](https://valtio.dev/) proxy stores under `src/frontend/src/stores/`, one file per domain (e.g. `recording.ts`, `chat.ts`, `layout.ts`). Components read state with `useSnapshot()` and mutate the proxy object directly — no actions/reducers boilerplate.

Local/server state (API data, caching) uses TanStack Query instead of a store.

## Accessibility & React Aria

Meet builds on [React Aria Components](https://react-spectrum.adobe.com/react-aria/) via styled primitives in `src/frontend/src/primitives/`. Prefer these over raw HTML or direct RAC imports.

### Rules

1. **Accessible names** : Every interactive element needs a name via `aria-label`, `aria-labelledby`, or visible text. Use i18n (`t(...)`) for all strings. Icon-only buttons must have `aria-label`; tooltips are supplementary, not a substitute.

2. **State announcements** : Use `useScreenReaderAnnounce()` for programmatic screen reader feedback (e.g. recording state, effects). Use the toast system (`@react-aria/toast`) for room events. Do not add `aria-live` to visual-only UI :  announce separately to avoid duplication.

3. **Focus management** :  RAC `Dialog` handles focus trap and return-to-trigger. Side panels and custom toolbars may need explicit focus (`autoFocus`, `ref.focus()`, or `FocusScope` from `@react-aria/focus`).

4. **Keyboard & screen reader testing** : Test Tab navigation, arrow keys in menus/toolbars, and verify with a screen reader before merging.

5. **PiP / cross-document contexts** : Use `VisualOnlyTooltip` instead of `TooltipWrapper` to prevent duplicate SR announcements.

```typescript
import { Button } from 'react-aria-components';

<Button
  aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
  aria-pressed={isMuted}
  onPress={toggleMute}
>
  {isMuted ? <MicOffIcon /> : <MicIcon />}
</Button>
```

## Internationalization

1. Add the key to the relevant namespace file under `locales/en/` and `locales/fr/` (minimum) — see `src/frontend/src/locales/` for the current namespaces (e.g. `rooms.json`, `settings.json`, `global.json`)
2. Use in components:

```typescript
const { t } = useTranslation();
<span>{t('controls.mute')}</span>
```

## Linting and formatting

```bash
make lint-front

# Or
cd src/frontend
npm run lint
npm run format
```

## Build-time environment variables

Set as Docker build arguments (`VITE_` prefix):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Not used in the published image: API calls use relative URLs |
| `VITE_APP_TITLE` | App title shown in the browser tab |

In the published `lasuite/meet-frontend` image, the frontend makes API calls using relative URLs (`/api/v1.0/...`). This means it works correctly as long as the SPA and the API are served from the same origin, which is exactly what the routing nginx in the `frontend` container provides.
