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

This builds the backend image, installs dependencies, runs migrations, creates a default user (`meet` / `meet`), compiles translations, adds demo data, and starts the stack.

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

Default credentials: Meet `meet`/`meet`, Django admin `admin@example.com`/`admin` at http://localhost:8071/admin/, Keycloak admin `admin`/`admin`, MinIO `meet`/`password`.

### Stop

```bash
make stop
```

### Reset to demo data

`make demo` empties the database, then loads demo data and recreates the Django admin.

```bash
make demo
```

## Developing the frontend and the backend

Hot reload, tests and linting for each side are in [Frontend](frontend.md#running-in-dev-mode) and [Backend](backend.md#running-the-backend).

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
