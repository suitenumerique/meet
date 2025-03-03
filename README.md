<p align="center">
  <a href="https://github.com/suitenumerique/meet">
    <img alt="Visio" src="./docs/assets/visio-logo.png" width="300" />
  </a>
</p>

<p align="center">
Welcome to Visio! The open-source, high-performance video conferencing solution for seamless collaboration.
</p>

<p align="center">
  <a href="./docs/">
    Documentation
  </a> - <a href="#getting-started">
    Getting started
  </a> - <a href="mailto:visio@numerique.gouv.fr">
    Reach out
  </a>
</p>

<img src="./docs/assets/visio_live_demo.gif" width="100%" align="center"/>

## Why use Visio ❓

Visio is designed to provide a reliable, secure, and easy-to-use video conferencing experience, tailored to government and enterprise needs.

### Simple & Efficient
*   🎥 High-quality video and audio powered by [LiveKit](https://livekit.io/)
*   🚀 No installation required—join calls directly from your browser
*   📱 Optimized for desktop and mobile use
*   ⚡️ Low latency, even with multiple participants

### Secure & Private
*   🏛 Self-hosted to ensure full data control
*   🎭 Authentication and access control for secure participation
*   🔒 End-to-end encryption for confidential meetings (coming soon)

### Customizable & Scalable
*   🛠 Open-source and fully customizable for specific needs
*   🌍 Scales effortlessly for large meetings and events
*   🎨 Extend functionality via integrations and APIs

## Getting started 🔧

### Run it locally

> ⚠️ Running Visio locally is for testing purposes only. For production, please refer to the deployment guide.

#### Prerequisites
Ensure you have a recent version of Docker and [Docker Compose](https://docs.docker.com/compose/install) installed:

```shellscript
$ docker -v
Docker version 20.10.2, build 2291f61

$ docker compose version
Docker Compose version v2.32.4
```

#### LiveKit CLI

Install LiveKit CLI, which provides utilities for interacting with the LiveKit ecosystem (including the server, egress, and more), please follow the instructions available in the [official repository](https://github.com/livekit/livekit-cli).

After installation, verify that the LiveKit CLI is working correctly:

```shellscript
$ lk --version
lk version 2.3.1
```

#### Project bootstrap
The easiest way to start working on the project is using GNU Make:

```shellscript
$ make bootstrap FLUSH_ARGS='--no-input'
```

This command builds the `app` container, installs dependencies, performs database migrations, and compiles translations.
Your Docker services should now be up and running 🎉

Access the project at <http://localhost:3000> with the default credentials:

```
username: visio
password: visio
```

To restart the application, use:
```shellscript
$ make run
```

For frontend development, install dependencies and start development mode:
```shellscript
$ make frontend-development-install
$ make run-frontend-development
```

To start all backend services without the frontend container:
```shellscript
$ make run-backend
```

#### Configure LiveKit CLI

For the optimal developer experience, create a default project named `visio` to use with `livekit-cli` commands:
```shellscript
$ lk project add
URL: http://localhost:7880
API Key: devkey
API Secret: secret
Give it a name for later reference: visio
? Make this project default?? [y/N] y
```

This way, you won't need to pass the project API Key and API Secret for each command.

#### Adding content
You can create a basic demo site by running:
```shellscript
$ make demo
```

View all available Make rules:
```shellscript
$ make help
```

#### Django admin
You can access the Django admin panel at <http://localhost:8071/admin>.

Create a superuser account:
```shellscript
$ make superuser
```

### Run application on local Kubernetes

The application is deployed across staging, preprod, and production environments using Kubernetes (K8s).
Reproducing environment conditions locally is crucial for developing new features or debugging issues.

This is facilitated by [Tilt](https://tilt.dev/) ("Kubernetes for Prod, Tilt for Dev"). Tilt enables smart rebuilds and live updates for services running locally in Kubernetes. We defined our services in a Tiltfile located at `bin/Tiltfile`.

#### Getting Started

Make sure you have installed:
- kubectl
- helm
- helmfile
- tilt

To build and start the Kubernetes cluster using Kind:
```shellscript
$ make build-k8s-cluster 
```

Once the Kubernetes cluster is ready, start the application stack locally:
```shellscript
$ make start-tilt
or
$ make start-tilt-keycloak # start stack without Pro Connect, use keycloak
```
These commands set up and run your application environment using Tilt for local Kubernetes development.

You can monitor Tilt's at `http://localhost:10350/`. After Tilt actions finish, you can access the app at `https://visio.127.0.0.1.nip.io/`.

#### Debugging frontend

Tilt deploys the `visio-dev` for the frontend by default, to benefit from Vite.js hot reloading while developing. 
To troubleshoot production issues, please modify the Tiltfile, switch frontend's target to `frontend-production`:

```yaml
...

docker_build(
    'localhost:5001/visio-frontend:latest',
    context='..',
    dockerfile='../src/frontend/Dockerfile',
    only=['./src/frontend', './docker', './.dockerignore'],
    target='frontend-production',  # Update this line when needed
    live_update=[
        sync('../src/frontend', '/home/frontend'),
    ]
)
...
```

## Roadmap

Want to know where Visio is headed? [🗺️ Check out our roadmap](https://github.com/orgs/numerique-gouv/projects/13/views/11)

## License 📝

This work is released under the MIT License (see [LICENSE](./LICENSE)).

## Contributing 🙌

This project is community-driven! Please, do not hesitate to get in touch if you have any question related to our implementation or design decisions.

## Credits ❤️

### Stack
Visio is built on top of [Django Rest Framework](https://www.django-rest-framework.org/), [Vite.js](https://vitejs.dev/), and [LiveKit](https://livekit.io/).
