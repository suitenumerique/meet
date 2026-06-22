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
| Linting | Ruff |

## Running the backend

```bash
# Start the backend container (dev mode with hot reload)
docker compose up -d app-dev

# Django shell
docker compose exec app-dev python manage.py shell

# Apply migrations
docker compose exec app-dev python manage.py migrate

# Create superuser
docker compose exec app-dev python manage.py createsuperuser
```

## Settings

The backend uses `django-configurations`. The settings class is selected via `DJANGO_CONFIGURATION`:

- `Development` - debug mode, relaxed security
- `Demo` - production-like with demo data
- `Production` - full production settings

All settings live in `src/backend/meet/settings.py` as a single file using `django-configurations` class inheritance.

## Key models

```python
# core/models.py

class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=255)
    access_level = models.CharField(...)  # public, authenticated, restricted
    configuration = models.JSONField(default=dict)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)

class Recording(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    room = models.ForeignKey(Room, on_delete=models.CASCADE)
    status = models.CharField(...)  # initiated, active, stopped, saved
    mode = models.CharField(...)    # screen_recording, transcript
    key = models.CharField(...)     # S3 object key (path in bucket)
```

After model changes, create and apply migrations:

```bash
docker compose exec app-dev python manage.py makemigrations
docker compose exec app-dev python manage.py migrate
```

## API views

Views use Django REST Framework ViewSets:

```python
class RoomViewSet(viewsets.ModelViewSet):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, IsRoomMemberOrPublic]

    def get_queryset(self):
        return Room.objects.filter(
            Q(access_level="public") | Q(accesses__user=self.request.user)
        )
```

## LiveKit token generation

The backend generates short-lived JWTs for clients:

```python
from livekit import api

token = (
    api.AccessToken(settings.LIVEKIT_CONFIGURATION["api_key"],
                    settings.LIVEKIT_CONFIGURATION["api_secret"])
        .with_identity(str(user.id))
        .with_name(user.full_name)
    .with_grants(api.VideoGrants(room_join=True, room=room.slug))
    .to_jwt()
)
```

## Celery tasks

Celery is used for async background operations. Currently the only task is file deletion cleanup (`core/tasks/file.py`):

```python
from core.tasks._task import task

@task
def process_file_deletion(file_id):
    """Delete a file from the database and from object storage."""
    file = File.objects.get(id=file_id)
    default_storage.delete(file.file_key)
    file.delete()
```

> **Note on recording notifications**: email notifications for completed recordings are sent **synchronously** in the storage webhook handler (`core/recording/event/notification.py`), not via Celery. `CELERY_ENABLED` is only needed when `FILE_UPLOAD_ENABLED=True` to handle file deletion cleanup asynchronously.

## Running tests

```bash
# All backend tests
make test-back

# Specific file
docker compose exec app-dev pytest core/tests/test_rooms.py

# With coverage
docker compose exec app-dev pytest --cov=meet --cov-report=html

# Single test
docker compose exec app-dev pytest core/tests/test_rooms.py::TestRoomCreate::test_authenticated
```

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
