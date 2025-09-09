# Getting Started

Before setting up, let's review Visio's architecture.

Visio consists of four main components that run simultaneously:

- React frontend, built with Vite.js
- Django server
- LiveKit server
- FastAPI server (optional, required for AI beta features)

These components rely on a few key services:

- PostgreSQL for storing data (users, rooms, recordings)
- Redis for caching and inter-service communication
- MinIO for storing files (room recordings)
- Celery workers for meeting transcript (optional, required for AI beta features)

We provide two stack options for getting Visio up and running for development:

- Docker Compose stack (recommended for most users)
- Kubernetes stack powered by Tilt (Advanced)

We recommend starting with the **Docker Compose** option for simplicity. However, if you're comfortable with running Kubernetes locally, the advanced option mirrors the production environment and provides most of the tools required for development (e.g., hot reloading).

These instructions are for macOS or Ubuntu. For other distros, adjust as needed.

If any steps are outdated, please let us know!

---

We also provide **GNU make utilities**. To view all available Make rules, run:
```shellscript
$ make help
```

---

## Need Help?
If you need any assistance or have questions while getting started, feel free to reach out to @lebaudantoine anytime! Antoine is available to help you onboard and guide you through the process. Chat with him @antoine.lebaud:matrix.org, or from the [support hotline](https://go.crisp.chat/chat/embed/?website_id=58ea6697-8eba-4492-bc59-ad6562585041).

---

## Option 1: Developing with Docker

### Prerequisites

1. Ensure you have a recent version of **Docker** and **Docker Compose** installed:
```shellscript
$ docker -v
Docker version 20.10.2, build 2291f61

$ docker compose version
Docker Compose version v2.32.4
```

2. Install **LiveKit CLI** by following the instructions available in the [official repository](https://github.com/livekit/livekit-cli). After installation, verify that it's working:
```shellscript
$ lk --version
lk version 2.3.1
```

---

### Project Bootstrap

1. Bootstrap the project using the **Make** command. This will build the `app` container, install dependencies, run database migrations, and compile translations:
```shellscript
$ make bootstrap FLUSH_ARGS='--no-input'
```

2. Access the project:
- The frontend is available at [http://localhost:3000](http://localhost:3000) with the default credentials:
    - username: meet
    - password: meet
- The Django backend is available at [http://localhost:8071](http://localhost:8071)

---

## Developing

- To **stop** the application:
```shellscript
$ make stop
```

- To **restart** the application:
```shellscript
$ make run
```

- For **frontend development**, start all backend services without the frontend container:
```shellscript
$ make run-backend
```

Then:
```shellscript
$ make frontend-development-install
$ make run-frontend-development
```

Which is equivalent to these direct npm commands:
```shellscript
$ cd src/frontend
$ npm i
$ npm run dev
```

---

## Adding Content

You can bootstrap demo data with a single command:
```shellscript
$ make demo
```

---

## Option 2: Developing with Kubernetes

Visio is deployed across staging, preprod, and production environments using **Kubernetes (K8s)**. Reproducing the environment locally is crucial for developing new features or debugging.

This is facilitated by [Tilt](https://tilt.dev/), which provides Kubernetes-like development for local environments, enabling smart rebuilds and live updates.

### Getting Started

Make sure you have the following installed:
- kubectl
- helm
- helmfile
- tilt

To build and start the Kubernetes cluster using **Kind**:
```shellscript
$ make build-k8s-cluster 
```

Once the Kubernetes cluster is ready, start the application stack locally:
```shellscript
$ make start-tilt-keycloak
```

Monitor Tilt’s progress at [http://localhost:10350/](http://localhost:10350/). After Tilt actions finish, you can access the app at [https://meet.127.0.0.1.nip.io/](https://meet.127.0.0.1.nip.io/).
