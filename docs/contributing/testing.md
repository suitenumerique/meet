# Testing

## Backend tests

### Running tests

```bash
# All backend tests
make test-back

# Directly with pytest
docker compose exec app-dev pytest

# Specific file
docker compose exec app-dev pytest core/tests/test_rooms.py

# Specific test
docker compose exec app-dev pytest core/tests/test_rooms.py::TestRoomViewSet::test_list_rooms

# With coverage report
docker compose exec app-dev pytest --cov=meet --cov-report=html
# Open htmlcov/index.html in your browser
```

### Test structure

```
src/backend/
└── core/
    └── tests/
        ├── test_models.py
        ├── rooms/
        │   └── test_api_rooms_*.py
        ├── recording/
        │   └── test_api_recordings_*.py
        └── services/
            └── test_livekit_*.py
```

### Writing backend tests

```python
import pytest
from rest_framework.test import APIClient
from core.factories import UserFactory, RoomFactory

@pytest.mark.django_db
class TestRoomAPI:
    def test_authenticated_user_can_create_room(self):
        user = UserFactory()
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post('/api/v1.0/rooms/', {
            'name': 'My Room',
            'slug': 'my-room',
        })

        assert response.status_code == 201
        assert response.data['slug'] == 'my-room'

    def test_unauthenticated_user_cannot_create_room(self):
        client = APIClient()
        response = client.post('/api/v1.0/rooms/', {'name': 'My Room'})
        assert response.status_code == 401
```

### Factories

```python
# core/factories.py
import factory
from core.models import Room, User

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    name = factory.Faker('name')

class RoomFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Room
    slug = factory.Sequence(lambda n: f"room-{n}")
    name = factory.Faker('sentence', nb_words=3)
    created_by = factory.SubFactory(UserFactory)
```

### Security regression tests

Every security fix must include a regression test. Example:

```python
def test_room_access_requires_membership(self):
    """Non-member cannot access a private room; regression for CVE-xxxx."""
    room = RoomFactory(access_level='restricted')
    other_user = UserFactory()
    client = APIClient()
    client.force_authenticate(user=other_user)

    response = client.get(f'/api/v1.0/rooms/{room.id}/')
    assert response.status_code == 403
```

## CI/CD

All tests run automatically on every pull request via GitHub Actions:

- Backend: pytest with coverage
- Linting: Ruff (Python) + ESLint (TypeScript)
- Docker: Build verification

All checks must pass before a PR can be merged.

## Testing philosophy

- Test behavior, not implementation
- Integration tests for API endpoints (`@pytest.mark.django_db`)
- Do not mock the database; use real test transactions
- Mock external services (LiveKit API, S3) at the boundary
- Every security fix must have a regression test
