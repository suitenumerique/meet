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
make shell

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

Refer to the source file for exact fields.

After model changes, create and apply migrations:

```bash
make makemigrations
make migrate
```

## API views

Views are implemented as Django REST Framework `ViewSet`s in [`core/api/viewsets.py`](../../src/backend/core/api/viewsets.py) (authenticated API) and [`core/external_api/viewsets.py`](../../src/backend/core/external_api/viewsets.py) (JWT-authenticated, scope-based API for external applications acting on behalf of users). Permissions are defined in `core/api/permissions.py`.

## LiveKit token generation

The backend generates short-lived JWTs for clients in `generate_token()` ([`core/utils.py`](../../src/backend/core/utils.py)). It builds a `VideoGrants` object (publish/subscribe rights, admin grants for room owners/admins) and an `AccessToken`, attaching display name, color, and role as participant attributes. See [`docs/contributing/livekit-integration.md`](livekit-integration.md) for the full flow.

## Celery tasks

Celery is used for async background operations. Tasks live under `core/tasks/` (e.g. file deletion cleanup, connection-test room teardown).

> **Note on recording notifications**: email notifications for completed recordings are sent **synchronously** from the LiveKit `egress_ended` webhook handler (`core/recording/event/notification.py`), not via Celery. With `CELERY_ENABLED` on, Celery hard-deletes connection-test rooms and deletes files asynchronously. With it off, connection-test rooms are never hard-deleted, and files are deleted inline.

## Running tests

```bash
make test-back
```

Running one file or one test, coverage, and the `bin/` helpers are in [Testing](testing.md#running-tests).

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
