# Local Development Setup

This guide sets up a complete LaSuite Meet development environment on your machine.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- Git
- Make
- LiveKit CLI

### Install LiveKit CLI

```bash
curl -sSL https://get.livekit.io/cli | bash
lk --version
```

## Clone the repository

```bash
git clone https://github.com/suitenumerique/meet.git
cd meet
```

## Option 1: Docker Compose (recommended)

The Docker Compose stack starts all services with a single command.

### Bootstrap (first time only)

```bash
make bootstrap FLUSH_ARGS='--no-input'
```

This builds the backend image, installs dependencies, runs migrations, creates a default user (`meet` / `meet`), and compiles translations.

### Start the stack

```bash
make run
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8071 |
| Keycloak (OIDC) | http://localhost:8083 |
| LiveKit | ws://localhost:7880 |
| MinIO | http://localhost:9000 (console: :9001) |
| Mailcatcher | http://localhost:1081 |

Default credentials: Meet `meet`/`meet`, Keycloak admin `admin`/`admin`, MinIO `meet`/`password`.

### Stop

```bash
make stop
```

### Add demo data

```bash
make demo
```

## Frontend development (hot reload)

Run the backend in the background and start the frontend with HMR:

```bash
make run-backend
make frontend-development-install
make run-frontend-development
```

Equivalent direct npm commands:
```bash
cd src/frontend
npm install
npm run dev
```

The frontend dev server runs at http://localhost:5173.

## Backend development

```bash
# Django shell
docker compose exec app-dev python manage.py shell

# Create superuser
docker compose exec app-dev python manage.py createsuperuser

# Run backend tests
make test-back

# Lint Python
make lint-back
```

Admin panel: http://localhost:8071/admin/

## Option 2: Kubernetes with Tilt

For a production-like local environment:

```bash
make build-k8s-cluster
make start-tilt-keycloak
# Monitor at http://localhost:10350/
# App at https://meet.127.0.0.1.nip.io/
```

## View all Make commands

```bash
make help
```
