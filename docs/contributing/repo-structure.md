# Repository Structure

```
meet/
├── src/
│   ├── backend/        # Django application (Python)
│   ├── frontend/       # React/TypeScript SPA (Vite)
│   ├── agents/         # LiveKit agents (metadata collector)
│   └── summary/        # FastAPI transcription/summary service
│
├── src/helm/           # Helm chart for Kubernetes deployment
├── docker/             # Docker configuration files
│   ├── auth/           # Keycloak realm config for development
│   └── livekit/        # LiveKit config + egress config for dev
│
├── docs/               # Documentation and installation guides
│   ├── assets/         # Images
│   ├── examples/       # Example compose files, nginx configs
│   └── installation/   # Installation guides (compose, kubernetes)
│
├── env.d/              # Environment variable files
│   ├── development/    # Development env templates
│   └── production.dist/# Production env templates (copy and edit)
│
├── deploy/             # PaaS deployment scripts (Scalingo)
├── bin/                # Utility scripts
├── crowdin/            # Translation config (Crowdin sync)
│
├── compose.yml         # Full development Docker Compose stack
├── Dockerfile          # Multi-stage Docker build
├── Makefile            # Development workflow commands
├── Procfile            # Process definitions (PaaS)
├── CHANGELOG.md        # Version history
├── CONTRIBUTING.md     # Contribution guidelines
├── UPGRADE.md          # Upgrade instructions between versions
└── SECURITY.md         # Security policy and contact
```

## Backend (`src/backend/`)

```
src/backend/
├── meet/
│   ├── settings.py     # Django settings (uses django-configurations)
│   ├── urls.py         # Root URL configuration
│   ├── celery_app.py   # Celery application config
│   └── wsgi.py         # WSGI entrypoint
├── core/
│   ├── models.py       # Room, Recording, User, Application models
│   ├── admin.py        # Django admin configuration
│   ├── urls.py         # URL router (registers all ViewSets)
│   ├── api/
│   │   ├── viewsets.py # DRF ViewSets (rooms, recordings, users, files)
│   │   └── serializers.py
│   ├── external_api/   # External JWT / application API
│   ├── addons/         # Microsoft add-in support (alpha)
│   ├── factories.py    # Factory Boy factories for tests
│   └── tests/          # Backend tests
├── pyproject.toml      # Python dependencies (managed with uv)
└── manage.py
```

Key models:
- `Room` - virtual meeting space with slug, access level, configuration
- `Recording` - recording metadata, state, and download URL
- `User` - created from OIDC tokens; no local password
- `Application` - external app integration for token exchange
- `ResourceAccess` - room membership and role assignments

## Frontend (`src/frontend/`)

```
src/frontend/
├── src/
│   ├── api/            # Typed fetch wrappers for backend endpoints
│   ├── components/     # Shared React components
│   ├── features/
│   │   ├── conference/ # In-meeting UI (controls, layout, chat, reactions)
│   │   ├── home/       # Home page, room creation
│   │   ├── rooms/      # Room management
│   │   └── settings/   # Settings panels
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand state stores
│   ├── i18n/           # Translation JSON files (fr, en, de, nl, …)
│   └── App.tsx         # Root component and routing
├── package.json
└── vite.config.ts
```

Tech stack: React 18, TypeScript, Vite, LiveKit React SDK, React Aria (Adobe), Zustand, i18next.

## Agents (`src/agents/`)

The metadata collector connects to LiveKit rooms as a silent agent and records participant activity (VAD events, connection events, chat) to object storage for use by the summary service.

## Summary service (`src/summary/`)

FastAPI service with two Celery queues:
- `transcribe-queue` - runs Whisper STT on recording files
- `summarize-queue` - calls an LLM API to generate meeting summaries

## Helm chart (`src/helm/meet/`)

```
src/helm/meet/
├── templates/          # Kubernetes resource templates
│   ├── backend_deployment.yaml
│   ├── frontend_deployment.yaml
│   ├── ingress.yaml
│   └── ...
├── values.yaml         # Default chart values
└── Chart.yaml          # Chart metadata
```

## Environment files (`env.d/`)

```
env.d/
├── development/
│   ├── common          # Backend env vars (dev)
│   ├── postgresql      # PostgreSQL connection (dev)
│   └── summary         # Summary service env vars (dev)
└── production.dist/
    ├── common          # Backend env vars (production template)
    ├── hosts           # Hostname variables
    └── postgresql      # PostgreSQL connection (production template)
```

Files ending in `.dist` are templates - copy and edit them, never commit the filled-in versions.
