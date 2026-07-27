# Repository Structure

```
meet/
├── src/
│   ├── backend/        # Django application (Python)
│   ├── frontend/       # React/TypeScript SPA (Vite)
│   ├── agents/         # LiveKit agents (metadata collector, subtitles)
│   ├── summary/        # FastAPI transcription/summary service
│   ├── addons/         # Calendar add-ins (Outlook)
│   ├── sdk/            # TypeScript SDK library and consumer
│   └── mail/           # Email templates (MJML)
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
│   ├── addons/         # Calendar add-in support (Outlook, etc.)
│   ├── services/       # Business logic services (livekit_events, lobby, etc.)
│   ├── recording/      # Recording worker services (egress, metadata collector)
│   ├── authentication/ # Authentication backends (OIDC, LiveKit tokens)
│   ├── analytics/      # Analytics tracking
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
│   │   ├── rooms/      # Room management, conference UI
│   │   ├── layout/     # Video layouts (grid, focus, carousel)
│   │   ├── chat/       # In-meeting chat
│   │   ├── participants/# Participant list and management
│   │   ├── recording/  # Recording controls and transcript UI
│   │   ├── reactions/  # Emoji reactions
│   │   ├── settings/   # Settings panels
│   │   ├── subtitle/   # Real-time subtitles
│   │   ├── pip/        # Picture-in-picture mode
│   │   ├── home/       # Home page
│   │   ├── auth/       # Authentication
│   │   └── sdk/        # SDK integration
│   ├── hooks/          # Custom React hooks
│   ├── stores/         # Zustand state stores
│   ├── i18n/           # Translation JSON files (fr, en, de, nl, …)
│   ├── utils/          # Utility functions
│   └── App.tsx         # Root component and routing
├── package.json
└── vite.config.ts
```

Tech stack: React 18, TypeScript, Vite, LiveKit React SDK, React Aria (Adobe), Zustand, i18next.

## Agents (`src/agents/`)

LiveKit agents connect to rooms as participants to provide real-time services:

- **`metadata_collector.py`** - Joins rooms silently to record participant activity (VAD events, connection events, chat) to object storage for use by the summary service
- **`multi_user_transcriber.py`** - Real-time multi-user speech-to-text transcription with support for multiple STT providers (Deepgram, Kyutai)

Agents are dispatched to rooms via LiveKit's agent dispatch API from the backend (`core/recording/services/` and `core/services/`).

## Summary service (`src/summary/`)

FastAPI service with Celery task queues for asynchronous processing:
- **`transcribe_queue_v2`** - Transcribes audio/video recordings using speech-to-text (STT)
- **`summarize_queue_v2`** - Generates meeting summaries using LLM APIs from transcripts
- **`call_webhook_queue_v2`** - Sends webhook notifications to the backend with results

The service also handles transcript formatting, user assignment (speaker diarization), and document generation.

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
│   ├── common.dist                   # Backend env vars (dev)
│   ├── postgresql.dist               # PostgreSQL connection (dev)
│   ├── kc_postgresql.dist            # Keycloak PostgreSQL (dev)
│   ├── summary.dist                  # Summary service env vars (dev)
│   ├── metadata_collector.dist       # Metadata collector agent (dev)
│   └── multi_user_transcriber.dist   # Transcriber agent (dev)
└── production.dist/
    ├── common                        # Backend env vars (production template)
    ├── hosts                         # Hostname variables
    ├── postgresql                    # PostgreSQL connection (production template)
    ├── keycloak                      # Keycloak configuration
    └── kc_postgresql                 # Keycloak PostgreSQL
```

Files ending in `.dist` are templates - copy them (without the `.dist` suffix) and edit them. Never commit the filled-in versions.
