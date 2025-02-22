# Meet

Meet is a simple video and phone conferencing tool, powered by [LiveKit](https://livekit.io/).

Meet is built on top of [Django Rest
Framework](https://www.django-rest-framework.org/) and [Vite.js](https://vitejs.dev/).

## Getting started

### Prerequisite

#### Docker

Make sure you have a recent version of Docker and [Docker
Compose](https://docs.docker.com/compose/install) installed on your laptop:

```bash
$ docker -v
  Docker version 20.10.2, build 2291f61

$ docker compose -v
  docker compose version 1.27.4, build 40524192
```

> ⚠️ You may need to run the following commands with `sudo` but this can be
> avoided by assigning your user to the `docker` group.

#### LiveKit CLI

Install LiveKit CLI, which provides utilities for interacting with the LiveKit ecosystem (including the server, egress, and more), please follow the instructions available in the [official repository](https://github.com/livekit/livekit-cli).

### Project bootstrap

The easiest way to start working on the project is to use GNU Make:

```bash
$ make bootstrap FLUSH_ARGS='--no-input'
```

Then you can access to the project in development mode by going to http://localhost:3000.
You will be prompted to log in, the default credentials are:
```bash
username: meet
password: meet
```
---

This command builds the `app` container, installs dependencies, performs
database migrations and compile translations. It's a good idea to use this
command each time you are pulling code from the project repository to avoid
dependency-related or migration-related issues.

Your Docker services should now be up and running 🎉

[FIXME] Explain how to run the frontend project.

### Configure LiveKit CLI

For the optimal DX, create a default project named `meet` to use with `livekit-cli` commands:
```bash
$ livekit-cli project add
URL: http://localhost:7880
API Key: devkey
API Secret: secret
Give it a name for later reference: meet
? Make this project default?? [y/N] y
```

Thus, you won't need to pass the project API Key and API Secret for each command.


### Adding content

You can create a basic demo site by running:

```bash
$ make demo
```

Finally, you can check all available Make rules using:

```bash
$ make help
```

### Django admin

You can access the Django admin site at
[http://localhost:8071/admin](http://localhost:8071/admin).

You first need to create a superuser account:

```bash
$ make superuser
```

### Run application on local Kubernetes

The application is deployed across staging, preprod, and production environments using Kubernetes (K8s).
Reproducing environment conditions locally is crucial for developing new features or debugging issues.

This is facilitated by [Tilt](https://tilt.dev/) ("Kubernetes for Prod, Tilt for Dev").  Tilt enables smart rebuilds and live updates for services running locally in Kubernetes.  We defined our services in a Tiltfile located at `bin/Tiltfile`.


#### Getting Started

Make sure you have installed:
- kubectl
- helm
- helmfile
- tilt

To build and start the Kubernetes cluster using Kind:
```shell
$ make build-k8s-cluster 
```

Once the Kubernetes cluster is ready, start the application stack locally:

```shell
$ make start-tilt-keycloak
```
These commands set up and run your application environment using Tilt for local Kubernetes development.

You can monitor Tilt's at `http://localhost:10350/`. After Tilt actions finish, you can access the app at `https://meet.127.0.0.1.nip.io/`.

#### Debugging frontend

Tilt deploys the `meet-dev` for the frontend by default, to benefit from Vite.js hot reloading while developing. 
To troubleshoot production issues, please modify the Tiltfile, switch frontend's target to `frontend-production`:

```yaml
...

docker_build(
    'localhost:5001/meet-frontend:latest',
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

## Contributing

This project is intended to be community-driven, so please, do not hesitate to
get in touch if you have any question related to our implementation or design
decisions.

## License

This work is released under the MIT License (see [LICENSE](./LICENSE)).
