# Testing

## Backend tests

### Running tests

```bash
# All backend tests
make test-back

# Specific file
bin/pytest core/tests/rooms/test_api_rooms_list.py

# Specific test
bin/pytest core/tests/rooms/test_api_rooms_list.py::test_api_rooms_list_authenticated

# With coverage report
bin/pytest --cov=core --cov-report=html
# Open htmlcov/index.html in your browser
```

`bin/pytest` runs pytest in the `app-dev` container with the `Test` configuration, which the tests need: a bare `docker compose exec app-dev pytest` runs under `Development` and fails tests that rely on `Test` settings. `bin/manage` runs `manage.py` the same way. Both work from any directory, so putting `bin/` on your `PATH` shortens them to `pytest` and `manage`:

```bash
export PATH="$PWD/bin:$PATH"   # from the repository root
```

### Test structure

Tests live under [`core/tests/`](../../src/backend/core/tests/). Model tests sit directly at the top level as `test_models_<area>.py` (e.g. `test_models_rooms.py`); API and other tests are grouped into per-area subdirectories with prefixed filenames (e.g. `test_api_rooms_*.py` in `rooms/`, `test_api_recordings_*.py` in `recording/`).

### Writing backend tests

Tests are written as module-level `pytest` functions (not test classes) using `pytest-django` (`@pytest.mark.django_db`) and DRF's `APIClient`. Use the factories from [`core/factories.py`](../../src/backend/core/factories.py) (e.g. `UserFactory`, `RoomFactory`) to set up test data instead of constructing model instances by hand.

## CI/CD

GitHub Actions runs linting and tests on every pull request — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) for the current set of jobs. All checks must pass before a PR can be merged.

## Testing philosophy

- Test behavior, not implementation
- Integration tests for API endpoints (`@pytest.mark.django_db`)
- Do not mock the database; use real test transactions
- Mock external services (LiveKit API, S3) at the boundary
