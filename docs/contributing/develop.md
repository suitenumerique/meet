# Develop locally

The whole stack runs on your machine in Docker Compose, driven by the [`Makefile`](https://github.com/suitenumerique/meet/blob/main/Makefile). The [Code tour](code-tour.md) shows where the code lives, and [Pull requests](pull-requests.md) how a change gets merged.

## TL;DR

```bash
# 1. Get the code; to propose a change, clone your fork instead, see Pull requests
git clone https://github.com/suitenumerique/meet.git && cd meet
# 2. Build the images, create the database and the demo data, start the stack
make bootstrap FLUSH_ARGS='--no-input'
# 3. Run the frontend with hot reload, then open http://localhost:3000 and sign in as meet / meet
make frontend-development-install && make run-frontend-development
# 4. Run every test suite, then every linter
make test && make lint && make frontend-lint && make frontend-format
# 5. Stop the stack, keeping its data
make stop
```

## Prerequisites

| Tool | What it is for |
|---|---|
| Git | Cloning the repository and committing |
| Docker Engine with the Compose plugin | Every service of the stack. The commands call `docker compose`, not the old `docker-compose` |
| GNU Make | The `make` targets on this page |
| Node.js 22 and npm | The frontend dev server, linters and tests, which run on your machine. The frontend image builds on [Node 22](https://github.com/suitenumerique/meet/blob/main/src/frontend/Dockerfile) |
| [uv](https://docs.astral.sh/uv/), optional | Adding or upgrading a Python dependency from your machine |

The `Makefile` runs every container under your user ID, through `DOCKER_USER`, so files a container writes into your checkout stay yours. Prefix a hand-typed `docker compose` the same way: `DOCKER_USER=$(id -u):$(id -g) docker compose ...`.

The stack publishes these ports, so they must be free: 3000, 8071, 8080, 8083, 8001, 9000, 1081, 6379, 15432, 5433, 7880, 7881, 7882/UDP, 3478/UDP and 30000 to 30100/UDP. All listen on `127.0.0.1` only, except LiveKit's 7880.

## Start the stack with Docker Compose

### First run

```bash
make bootstrap FLUSH_ARGS='--no-input'   # once after cloning, and again to start over
```

It empties the database, then creates the Django admin and 100 demo users. It keeps the files you already have in `env.d/development/`, and does not install the frontend's npm dependencies on your machine: `make frontend-development-install` does.

### Where everything answers

| Service | Address | Default login |
|---|---|---|
| Meet | <http://localhost:3000> | `meet` / `meet`, a user of the `meet` realm that Keycloak imports from [`docker/auth/realm.json`](https://github.com/suitenumerique/meet/blob/main/docker/auth/realm.json) |
| Backend API | <http://localhost:8071/api/v1.0/>, schema at <http://localhost:8071/api/v1.0/swagger/> and <http://localhost:8071/api/v1.0/redoc/> | The browser session from signing in to Meet |
| Django admin | <http://localhost:8071/admin/> | `admin@example.com` / `admin`, created by `make superuser` |
| Keycloak | <http://localhost:8083>, behind the `nginx` container | `admin` / `admin` for the administration console |
| LiveKit | `ws://localhost:7880` | API key `devkey`, secret `secret`, from [`docker/livekit/config/livekit-server.yaml`](https://github.com/suitenumerique/meet/blob/main/docker/livekit/config/livekit-server.yaml) |
| Garage, the S3 storage | <http://localhost:9000>, bucket `meet-media-storage`, no web console | Access key `meet-access-key`, secret `meet-secret-access-key` |
| Mailcatcher | <http://localhost:1081>, every email the backend sends | None |
| Summary service API | <http://localhost:8001> | The tenant `api_key` in `env.d/development/summary`, `password` by default |
| PostgreSQL | `localhost:15432`, database `meet` | `dinum` / `pass` |

### Everyday commands

| Command | What it does |
|---|---|
| `make run` | Starts the backend and its services, the summary service and the frontend container. Run it after `make stop`, and after editing `env.d/development/` to recreate the containers reading it |
| `make run-backend` | Starts only what the backend needs: the Django server, its Celery worker, PostgreSQL, Redis, Mailcatcher, Garage, Keycloak behind nginx, and LiveKit with Egress. Use it when the frontend runs outside its container |
| `make run-summary` | Starts the summary service API and its two Celery workers, the transcription one and the summary one |
| `make stop` | Stops every container and keeps them, so the database survives until the next `make run` |
| `make down` | Removes the containers and their network, and the database with the PostgreSQL container: run `make migrate` and `make demo` after the next start. Garage's files stay in `data/media` |
| `make status` | Lists the containers and their state, as `docker compose ps` does |
| `make logs` | Follows the Django server's log. For another service, run `docker compose logs -f <service>`, with a service name from [`compose.yml`](https://github.com/suitenumerique/meet/blob/main/compose.yml) |
| `make demo` | Empties the database, recreates the Django admin and creates the demo users. It asks for confirmation unless you add `FLUSH_ARGS='--no-input'` |
| `make resetdb` | Empties the database and recreates the Django admin, without the demo users |
| `make superuser` | Creates the Django admin `admin@example.com` with password `admin`, or resets that password if the account exists |
| `make help` | Lists the `make` targets with their one-line descriptions. A bare `make` runs it too |
| `make clean` | Runs `git clean -idx`: lists every untracked or ignored file, your env files, `data/` and `node_modules/` included, and asks before deleting them |

### LiveKit agents

`make run` leaves the subtitles agent and the metadata collector off, since each costs CPU and memory. When a feature's agent is stopped, the feature fails silently: the backend still sends the agent work.

| Command | What it does |
|---|---|
| `make run-agent-multi-user-transcriber` | Starts the subtitles agent. Enable it with [`ROOM_SUBTITLE_ENABLED`](../reference/env-variables.md#subtitles) in `env.d/development/common`, and give it a speech-to-text provider in `env.d/development/multi_user_transcriber`, see [Subtitles agent](../reference/env-variables.md#subtitles-agent) |
| `make run-agent-metadata-collector` | Starts the metadata collector, which records who speaks when during a transcription. Enable it with [`METADATA_COLLECTOR_ENABLED`](../reference/env-variables.md#metadata-collector) in `env.d/development/common` |
| `make run-agents` | Starts both |

After changing either setting, run `make run-backend` so the backend reads the new value.

### Files in storage

Garage keeps recordings, transcripts and summaries in its own format under `data/media`: read them through these targets.

| Command | What it does |
|---|---|
| `make recordings-list` | Lists the recordings, most recent first, with date, key and size |
| `make recordings-download-latest` | Copies the most recent recording into `data/recordings/` |
| `make transcripts-list`, `make transcripts-download-latest` | The same for transcripts, into `data/transcripts/` |
| `make summaries-list`, `make summaries-download-latest` | The same for summaries, into `data/summaries/` |

## Work on the backend

- The `app-dev` container runs Django's development server with [`src/backend`](https://github.com/suitenumerique/meet/tree/main/src/backend) mounted at `/app`: saving a Python file restarts it.
- The Celery worker, `celery-dev`, does not reload: run `make run-backend` after changing a task.
- The container runs the `Development` configuration, with debug mode and the [API schema pages](../reference/api.md#interactive-api-explorer) on. Its settings come from `env.d/development/common` and `env.d/development/postgresql`, documented in [Environment variables](../reference/env-variables.md).

| Command | What it does |
|---|---|
| `make makemigrations` | Starts PostgreSQL, then creates a migration in `src/backend/core/migrations/` for every model change. Commit the new file with the change |
| `make migrate` | Starts PostgreSQL, then applies the migrations. Run it after pulling a branch that adds one |
| `make shell` | Opens a Django shell in a new `app-dev` container |
| `make dbshell` | Opens `psql` on the database, inside the running `app-dev` container. The stack must be up |
| `bin/manage <command>` | Runs any `manage.py` command in a new `app-dev` container under `Development`, for example `bin/manage showmigrations` |
| `make back-i18n-generate`, `make back-i18n-compile` | Extract and compile the backend's translatable strings, see [Translations](#translations) |

## Work on the frontend

The `frontend` container on port 3000 serves a production build of [`src/frontend`](https://github.com/suitenumerique/meet/tree/main/src/frontend): it shows a change only after `make build-frontend` and `make run`. The settings it reads at runtime come from the backend, under [Frontend](../reference/env-variables.md#frontend). For daily work, start the backend with `make run-backend`, then run the Vite dev server on your machine, which reloads on every save:

| Command | What it does |
|---|---|
| `make frontend-development-install` | Runs `npm install` in `src/frontend`. Run it once, and again when `package-lock.json` changes |
| `make run-frontend-development` | Stops the frontend container, then runs `npm run dev`: generates the Panda CSS code and serves the app on <http://localhost:3000> with hot reload, calling the API on <http://localhost:8071>, from [`.env.development`](https://github.com/suitenumerique/meet/blob/main/src/frontend/.env.development) |
| `make build-frontend` | Rebuilds the frontend container's image. Run it before `make run` when you go back to the container |

Every `npm` script runs from `src/frontend`. The `make` targets call the main ones; the others are:

| Command | What it does |
|---|---|
| `npm run build` | Generates the Panda CSS code, type-checks with `tsc`, then builds into `dist/`. Catches the type errors that fail CI's image build |
| `npm run build:debug` | Runs `npm run build` with a bundle size report, written to `rollup-plugin-visualizer/stats.html` |
| `npm run preview` | Serves the last `npm run build` output, to check a production bundle |
| `npm run lint:fix` | Fixes what ESLint can fix by itself |
| `npm run check` | Checks the formatting without changing anything, as CI does: any file Prettier would change fails |

## Tests

| Command | What it does |
|---|---|
| `make test` | Runs the backend suite in parallel, then the summary service and frontend suites, stopping at the first failure. `ARGS` passes pytest arguments to the first two, as in `make test ARGS="-x"` |
| `make test-back` | Runs the backend suite on one process. `make test-back ARGS="core/tests/rooms/"` limits it to a directory |
| `make test-back-parallel` | Runs the backend suite on every CPU core, through pytest-xdist |
| `make test-summary` | Runs the summary service suite |
| `make test-frontend` | Runs `npm test` in `src/frontend`: generates the Panda CSS code, then runs Vitest once. Needs `make frontend-development-install` first |
| `bin/pytest <arguments>` | Runs pytest in a new `app-dev` container, from any directory. Paths are relative to `src/backend` |
| `bin/pytest-summary <arguments>` | Runs pytest in a new summary service container |

Examples of `bin/pytest`:

```bash
# One file
bin/pytest core/tests/rooms/test_api_rooms_list.py
# One test
bin/pytest core/tests/rooms/test_api_rooms_list.py::test_api_rooms_list_authenticated
# Coverage, written as HTML to src/backend/htmlcov/index.html
bin/pytest --cov=core --cov-report=html
```

With `export PATH="$PWD/bin:$PATH"` from the repository root, `pytest` and `manage` run these wrappers directly.

The backend suite needs the `Test` configuration, which `bin/pytest` sets. A bare `docker compose run app-dev pytest` runs under `Development`, where the external API and add-ons tests fail.

**Backend tests** live in [`src/backend/core/tests/`](https://github.com/suitenumerique/meet/tree/main/src/backend/core/tests):

- Model tests as `test_models_<area>.py`, API tests as `test_api_<area>_*.py`, in a subdirectory such as `rooms/` or `recording/` where an area has many.
- Plain pytest functions, marked `pytest.mark.django_db` when they touch the database, calling the API through DRF's `APIClient`.
- Data comes from the factories in [`core/factories.py`](https://github.com/suitenumerique/meet/blob/main/src/backend/core/factories.py).
- They use the real test database, and patch only what leaves the backend, such as `core.utils.create_livekit_client` for LiveKit or the S3 client.

**Frontend tests** sit next to the code they test, as `*.test.ts` files.

The agents have no test suite. The SDK has none either, and CI builds it instead, see [Lint and format](#lint-and-format).

## Lint and format

The `make` targets fix what they can in place. CI only checks, so run them before pushing and commit what they change.

| Command | What it does |
|---|---|
| `make lint` | Runs `make lint-back`, `make lint-agents` and `make lint-summary` |
| `make lint-back` | Runs `ruff format`, `ruff check --fix`, then `pylint` on the `meet`, `demo` and `core` packages, in a backend container started without its services |
| `make lint-agents`, `make lint-summary` | Runs `ruff format` and `ruff check --fix` on the agents or on the summary service |
| `make lint-ruff-format`, `make lint-ruff-check`, `make lint-pylint` | Runs one backend step alone. `make lint-pylint` checks all of `meet`, `demo` and `core`, despite its help text saying only files changed from `main` |
| `make frontend-lint` | Runs ESLint on the frontend, where any warning fails |
| `make frontend-format` | Runs Prettier on `src/frontend/src`, rewriting the files |
| `cd src/sdk/library && npm ci && npm run lint && npm run check && npm run build` | Lints, checks the formatting of, and builds the SDK, as CI does. Run it when you touch [`src/sdk`](https://github.com/suitenumerique/meet/tree/main/src/sdk) |

CI also checks commit messages, spelling and shell scripts: [What CI checks](pull-requests.md#what-ci-checks) gives the local command for each.

## Translations

The interface ships in English, French, German, Dutch and Spanish, and every string is translated in the pull request that adds it.

**Frontend.** A component reads its strings through `t()` from `react-i18next`, by key, from a namespace file in [`src/frontend/src/locales/<language>/`](https://github.com/suitenumerique/meet/tree/main/src/frontend/src/locales). [`HandToggle.tsx`](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/features/rooms/livekit/components/controls/HandToggle.tsx) reads `controls.hand.raise` or `controls.hand.lower` from `rooms.json`:

```tsx
const { t } = useTranslation('rooms', { keyPrefix: 'controls.hand' })
// ...
const tooltipLabel = isHandRaised ? 'lower' : 'raise'
// ...
aria-label={t(tooltipLabel)} // controls.hand.raise or controls.hand.lower
```

| Command | What it does |
|---|---|
| `make frontend-i18n-extract` | Runs `npm run i18n:extract`: adds each new `t()` key, empty, in all five languages, removes unused keys and sorts the files. Fill every empty value before pushing: it shows as blank text, not a fallback |

**Backend.** Emails and API messages use Django's gettext, with one catalogue per language in [`src/backend/locale/`](https://github.com/suitenumerique/meet/tree/main/src/backend/locale).

| Command | What it does |
|---|---|
| `make back-i18n-generate` | Runs `makemessages` for every language, which adds new strings to each `django.po` file. Translate them there |
| `make back-i18n-compile` | Compiles the `.po` files into the `.mo` files Django reads. `make bootstrap` runs it; run it again to see your translations |

The `crowdin-*`, `i18n-generate-and-upload` and `i18n-download-and-compile` targets sync the catalogues with Crowdin. They are for maintainers, and need a Crowdin token in `env.d/development/crowdin`.

## Email templates

The emails are written in MJML in [`src/mail/mjml/`](https://github.com/suitenumerique/meet/tree/main/src/mail/mjml) and compiled into the templates the backend sends.

| Command | What it does |
|---|---|
| `make mails-install` | Installs the generator's npm dependencies, in a Node container. `make bootstrap` runs it |
| `make mails-build` | Compiles every `.mjml` file into HTML and plain text under `src/backend/core/templates/mail/`. Run it after editing a template; Mailcatcher shows the result |

## Add a dependency

Every dependency is pinned to an exact version. CI installs from the lock files, with `uv sync --locked` and `npm ci`, so a manifest edited without its lock file fails.

| Command | What it does |
|---|---|
| `cd src/backend && uv add "<package>==<version>"` | Adds a backend dependency to `pyproject.toml` and `uv.lock`. Add `--dev` for a tool only tests or linters use |
| `make build-backend` | Rebuilds the backend image with the new dependency. `uv` exists only during the build, so it cannot install into a running container |
| `DOCKER_USER=$(id -u):$(id -g) docker compose up -d --force-recreate --renew-anon-volumes app-dev celery-dev` | Restarts the backend on the new image. `--renew-anon-volumes` replaces the old container's virtual environment volume, which a plain restart keeps |
| `cd src/agents && uv add "<package>==<version>"`, then `make build-agents` | The same for the agents. `make build-agents` rebuilds the subtitles agent; rebuild the metadata collector with `docker compose build metadata-collector-dev` |
| `cd src/summary && uv add "<package>==<version>"`, then `docker compose build app-summary-dev celery-summary-transcribe celery-summary-summarize` | The same for the summary service, whose three containers each build their own image |
| `cd src/frontend && npm install --save-exact <package>@<version>` | Adds a frontend dependency to `package.json` and `package-lock.json`. Run `make build-frontend` if you use the frontend container |

## Nix with devenv

On a Nix workstation, [`devenv.nix`](https://github.com/suitenumerique/meet/blob/main/devenv.nix) provides the tools of [Prerequisites](#prerequisites) instead:

| Command | What it does |
|---|---|
| `devenv shell` | Opens a shell with Python 3.13, Node.js 22, uv, gettext, the PostgreSQL client, the Docker and Podman clients, and installs gitlint as a commit-message hook. It points `docker` at the Podman socket: set `MEET_PODMAN_SOCKET=0` before entering to keep Docker |
| `devenv --profile agents shell` | Adds what the LiveKit agents need, including the LiveKit CLI. The `summary` profile adds Redis, and `k8s` adds the tools listed under [Kubernetes with Tilt](#kubernetes-with-tilt) |
| `meet-venv` | Inside the shell, creates or refreshes the virtual environments of `src/backend`, `src/agents` and `src/summary` |

## Kubernetes with Tilt

[Tilt](https://tilt.dev/) runs Meet in a local Kubernetes cluster with the [Helm chart](https://github.com/suitenumerique/meet/tree/main/src/helm) and copies your edits into the running pods. Use it only when a change touches the chart or depends on Kubernetes.

Besides Docker, it needs:

| Tool | What it is for |
|---|---|
| [kind](https://kind.sigs.k8s.io/) | The local cluster |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Talking to the cluster |
| [Helm](https://helm.sh/) and [helmfile](https://helmfile.readthedocs.io/) | Rendering the chart and its development services from [`src/helm/helmfile.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/helmfile.yaml.gotmpl) |
| [Tilt](https://docs.tilt.dev/install.html) | Building the images, deploying them and syncing your edits |
| [mkcert](https://github.com/FiloSottile/mkcert) | The local certificate authority behind the cluster's HTTPS |

| Command | What it does |
|---|---|
| [`./bin/start-kind.sh`](https://github.com/suitenumerique/meet/blob/main/bin/start-kind.sh) | Run it once. It creates a kind cluster `suite` serving `*.127.0.0.1.nip.io` over HTTPS, with a mkcert certificate authority and an image registry on `localhost:5001`. It pipes [`create_cluster.sh`](https://github.com/numerique-gouv/tools/blob/main/kind/create_cluster.sh) from `numerique-gouv/tools` to `bash`: read that script first |
| `make build-k8s-cluster` | Copies `env.d/development/kube-secret.dist` if needed. It does not create the cluster |
| `make start-tilt-keycloak` | Runs `tilt up` with [`bin/Tiltfile`](https://github.com/suitenumerique/meet/blob/main/bin/Tiltfile) in the `meet` namespace, with a Keycloak in the cluster. Builds the backend, frontend, summary, agents and LiveKit images, deploys the chart, applies the migrations and creates the Django admin once |
| `make start-tilt-dinum` | The same, with the DINUM-styled frontend from [`docker/dinum-frontend`](https://github.com/suitenumerique/meet/tree/main/docker/dinum-frontend) |
| `tilt down --namespace=meet -f ./bin/Tiltfile` | Deletes what Tilt deployed. Stopping `tilt up` with Ctrl+C leaves the deployment running |
| `kind delete cluster --name suite` | Deletes the cluster |

Tilt's dashboard is at <http://localhost:10350/> and Meet at <https://meet.127.0.0.1.nip.io/>. On the `meet-backend` resource, the **Run makemigration** and **Run database migration** buttons run those commands in the backend pod.

## Work on this documentation site

[Zensical](https://zensical.org/) builds this site from the Markdown in [`docs/`](https://github.com/suitenumerique/meet/tree/main/docs), with its name and navigation in [`zensical.toml`](https://github.com/suitenumerique/meet/blob/main/zensical.toml). It needs only Docker; run each command from the repository root.

| Command | What it does |
|---|---|
| `docker run --rm -it -p 8000:8000 -v "$PWD":/docs zensical/zensical` | Serves the site on <http://localhost:8000> and rebuilds a page when you save its file |
| `docker run --rm -v "$PWD":/docs zensical/zensical build` | Builds the static site into `site/`, which Git ignores |
| `docker pull zensical/zensical` | Updates the Zensical image |

The home page is `docs/index.md`. Do not add a `docs/README.md`: Zensical would build it into the same `index.html`.

A page follows these rules:

- **One fact lives in one place.** Every other page links to it rather than repeating it.
- **Environment variables are documented only in [Environment variables](../reference/env-variables.md).** Another page names the variable and links its row.
- **Problems and their fixes go only in [Troubleshooting](../reference/troubleshooting.md).**
- **Source files are linked on GitHub, not described line by line.** Link `https://github.com/suitenumerique/meet/blob/main/<path>`: a relative link to a file outside `docs/` works in the editor but is dead on the built site.
- **Every screenshot is a figure with a caption:**

    ```html
    <figure markdown="span">
      ![Participants panel](../assets/participants-panel.png)
      <figcaption>Participants panel, a menu per name</figcaption>
    </figure>
    ```

    Two screenshots side by side go in one `<div class="figure-row" markdown>`. Images live in [`docs/assets/`](https://github.com/suitenumerique/meet/tree/main/docs/assets).
- **An icon inside a sentence or a table has `class="off-glb"`**, which keeps it out of the lightbox that opens screenshots full size: `<img class="off-glb" src="../assets/icons/mic-line.svg" width="20" />`.
- **A new page is added to `nav` in `zensical.toml`**, or it builds without appearing in the navigation.

CI's spelling and shellcheck jobs cover `docs/` too, see [What CI checks](pull-requests.md#what-ci-checks).
