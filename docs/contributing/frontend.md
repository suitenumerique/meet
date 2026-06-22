# Frontend Development

The Meet frontend is a TypeScript/React SPA built with Vite.

## Tech stack

| Component | Technology |
|---|---|
| Framework | React 18 |
| Language | TypeScript |
| Build tool | Vite |
| WebRTC | `@livekit/components-react` |
| Accessible UI | React Aria (Adobe) |
| State management | Zustand |
| i18n | i18next |
| Testing | Vitest + React Testing Library |
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

Dev server runs at http://localhost:5173 with hot module replacement.

## Project structure

```
src/frontend/src/
├── api/              # Typed fetch wrappers for backend endpoints
├── components/       # Shared/reusable components
├── features/
│   ├── conference/   # In-meeting UI
│   │   ├── controls/ # Mic, camera, screen share, reactions
│   │   ├── layout/   # Video grid, speaker view
│   │   ├── chat/     # Chat panel
│   │   └── recording/# Recording / transcription panels
│   ├── home/         # Home page, room creation
│   └── settings/     # Settings panels
├── hooks/            # Custom React hooks
├── stores/           # Zustand state stores
├── i18n/             # Translation files (en.json, fr.json, …)
└── App.tsx           # Root component + routing
```

## LiveKit connection

```typescript
import { LiveKitRoom, VideoConference } from '@livekit/components-react';

// Token and URL come from GET /api/v1.0/rooms/{id}/ → response.livekit.token / .url
<LiveKitRoom token={token} serverUrl={url} connect>
  <VideoConference />
</LiveKitRoom>
```

## State management

```typescript
import { create } from 'zustand';

interface ConferenceStore {
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
}

export const useConferenceStore = create<ConferenceStore>((set) => ({
  isRecording: false,
  setIsRecording: (v) => set({ isRecording: v }),
}));
```

## Accessibility

Meet uses React Aria for accessible component primitives. Rules:

- All interactive elements must have an accessible name (`aria-label` or visible text)
- State changes (mute/unmute, recording) must be announced via ARIA live regions
- Focus management: opening dialogs moves focus in; closing returns focus to the trigger
- Test every new interactive element with keyboard navigation

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

1. Add the key to `en.json` and `fr.json` (minimum)
2. Use in components:

```typescript
const { t } = useTranslation();
<span>{t('controls.mute')}</span>
```

Other languages are managed via Crowdin.

## Running tests

```bash
make test-front

# Or directly
cd src/frontend
npm test
npm run test:coverage
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
