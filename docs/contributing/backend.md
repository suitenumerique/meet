# Backend Development

The Meet backend is a Django 5.x application written in Python 3.13+.

## Tech stack

| Component | Technology |
|---|---|
| Framework | Django 5.x + Django REST Framework |
| Language | Python 3.13+ |
| Package manager | `uv` |
| Auth | mozilla-django-oidc |
| LiveKit integration | `livekit-api` (Python SDK) |
| Async tasks | Celery |
| Testing | pytest + pytest-django |
| Linting | Ruff + Pylint |

## Running the backend

```bash
# Start the backend container (dev mode with hot reload)
make run-backend

# Django shell
docker compose exec app-dev python manage.py shell (we might add a command for this one if missing)

# Apply migrations
make migrate

# Create superuser
make superuser
```

## Settings

The backend uses `django-configurations`. The settings class is selected via `DJANGO_CONFIGURATION`:

- `Development` - debug mode, relaxed security
- `Test` - test environment
- `Demo` - production-like with demo data
- `Production` - full production settings

All settings live in `src/backend/meet/settings.py` as a single file using `django-configurations` class inheritance.

## Key models

The main models live in [`core/models.py`](../../src/backend/core/models.py):

- **`Room`** — extends `Resource`; holds the room `slug`, `access_level` (`public`, `trusted`, `restricted`), a free-form `configuration` JSON field exposed to participants, and an optional telephony `pin_code`.
- **`Recording`** — extends `BaseModel`; tracks a recording's `status` (`initiated`, `active`, `stopped`, `saved`, plus failure/abort states) and `mode` (`screen_recording`, `transcript`), and links back to its `Room`.

Refer to the source file directly for exact fields, as this doc can drift from the code.

After model changes, create and apply migrations:

```bash
make migrate
```

## API views

Views are implemented as Django REST Framework `ViewSet`s in [`core/api/viewsets.py`](../../src/backend/core/api/viewsets.py) (authenticated API) and [`core/external_api/viewsets.py`](../../src/backend/core/external_api/viewsets.py) (JWT-authenticated, scope-based API for external applications acting on behalf of users). Permissions are defined in `core/api/permissions.py`.

## LiveKit token generation

The backend generates short-lived JWTs for clients in `generate_token()` ([`core/utils.py`](../../src/backend/core/utils.py)). It builds a `VideoGrants` object (publish/subscribe rights, admin grants for room owners/admins) and an `AccessToken`, attaching display name, color, and role as participant attributes. See [`docs/contributing/livekit-integration.md`](livekit-integration.md) for the full flow.

## Celery tasks

Celery is used for async background operations. Tasks live under `core/tasks/` (e.g. file deletion cleanup, connection-test room teardown) — see that directory for the current list rather than duplicating it here, as it changes over time.

> **Note on recording notifications**: email notifications for completed recordings are sent **synchronously** from the LiveKit `egress_ended` webhook handler (`core/recording/event/notification.py`), not via Celery. There is no separate object-storage webhook. `CELERY_ENABLED` is only needed when `FILE_UPLOAD_ENABLED=True` to handle file deletion cleanup asynchronously.

## Running tests

```bash
# All backend tests
make test-back

# Specific file
docker compose exec app-dev pytest core/tests/rooms/test_api_rooms_list.py

# With coverage
docker compose exec app-dev pytest --cov=meet --cov-report=html

# Single test
docker compose exec app-dev pytest core/tests/rooms/test_api_rooms_list.py::test_api_rooms_list_authenticated
```

See [`docs/contributing/testing.md`](testing.md) for more on backend test conventions.

## Code style

```bash
# Lint and format (Ruff)
make lint-back

# Or directly
docker compose exec app-dev ruff check .
docker compose exec app-dev ruff format .
```

## Adding dependencies

```bash
docker compose exec app-dev uv add <package>
# pyproject.toml and uv.lock are updated automatically
```

## Django admin

Available at `/admin/`. Key sections:
- **Rooms** - list, configure rooms
- **Recordings** - view recording state and storage keys
- **Users** - manage accounts
- **Applications** - external app integrations
