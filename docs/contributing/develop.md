# Develop locally

The whole stack runs on your machine in Docker Compose, driven by the [`Makefile`](https://github.com/suitenumerique/meet/blob/main/Makefile). Where the code lives is in the [Code tour](code-tour.md), and how a change gets merged in [Pull requests](pull-requests.md).

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
| Docker Engine with the Compose v2 plugin | Every service of the stack. The commands call `docker compose`, not the old `docker-compose` |
| GNU Make | The `make` targets on this page |
| Node.js 22 and npm | The frontend dev server, its linters and its tests, which run on your machine rather than in a container. The frontend image builds on [Node 22](https://github.com/suitenumerique/meet/blob/main/src/frontend/Dockerfile) |
| [uv](https://docs.astral.sh/uv/), optional | Adding or upgrading a Python dependency from your machine |

The `Makefile` runs every container under your own user ID, through `DOCKER_USER`, so files a container writes into your checkout stay yours. Calling `docker compose` by hand, prefix it the same way: `DOCKER_USER=$(id -u):$(id -g) docker compose ...`.

The stack publishes these ports, so they must be free: 3000, 8071, 8080, 8083, 8001, 9000, 1081, 6379, 15432, 5433, 7880, 7881, 7882/UDP, 3478/UDP and 30000 to 30100/UDP. All listen on `127.0.0.1` only, except LiveKit's 7880.

On a Nix workstation, [`devenv.nix`](https://github.com/suitenumerique/meet/blob/main/devenv.nix) provides the tools instead:

| Command | What it does |
|---|---|
| `devenv shell` | Opens a shell with Python 3.13, Node.js 22, uv, gettext, the PostgreSQL client, the Docker and Podman clients, and installs gitlint as a commit-message hook |
| `devenv --profile agents shell` | Adds what the LiveKit agents need, including the LiveKit CLI. The `summary` profile adds Redis, and `k8s` adds the tools listed under [Kubernetes with Tilt](#kubernetes-with-tilt) |
| `meet-venv` | Inside the shell, creates or refreshes the virtual environments of `src/backend`, `src/agents` and `src/summary` |

## Start the stack with Docker Compose

### First run

```bash
make bootstrap FLUSH_ARGS='--no-input'
```

Run it once after cloning, and again to start over from a clean database. In order, it:

1. Creates `data/media` and `data/static`, which the containers mount.
2. Copies each template in [`env.d/development/`](https://github.com/suitenumerique/meet/tree/main/env.d/development) to the same name without `.dist`, skipping files that already exist, and fills `env.d/development/garage` with a random secret.
3. Builds the backend, frontend and subtitles agent images.
4. Applies the database migrations.
5. Empties the database, creates the Django admin and 100 demo users, as `make demo` does. `FLUSH_ARGS='--no-input'` skips the confirmation that emptying the database asks for.
6. Compiles the backend translations.
7. Installs the email template generator and builds the email templates.
8. Starts the stack, as `make run` does.

It does not install the frontend's npm dependencies on your machine: `make frontend-development-install` does, before you first run the frontend outside its container.

### Where everything answers

| Service | Address | Default login |
|---|---|---|
| Meet | <http://localhost:3000> | `meet` / `meet`, a user of the `meet` realm that Keycloak imports from [`docker/auth/realm.json`](https://github.com/suitenumerique/meet/blob/main/docker/auth/realm.json) |
| Backend API | <http://localhost:8071/api/v1.0/>, its schema, generated from the code, at <http://localhost:8071/api/v1.0/swagger/> and <http://localhost:8071/api/v1.0/redoc/> | The browser session from signing in to Meet |
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
| `make run` | Starts the backend and its services, the summary service and the frontend container. Run it after `make stop`, and after editing a file in `env.d/development/` so the containers reading it are recreated |
| `make run-backend` | Starts only what the backend needs: the Django server, its Celery worker, PostgreSQL, Redis, Mailcatcher, Garage, Keycloak behind nginx, and LiveKit with Egress. Use it when the frontend runs outside its container |
| `make run-summary` | Starts the summary service API and its two Celery workers, the transcription one and the summary one |
| `make stop` | Stops every container and keeps them, so the database survives until the next `make run` |
| `make down` | Removes the containers and their network. The database lives inside the PostgreSQL container, so it goes too: run `make migrate` and `make demo` after the next start. Garage's files stay in `data/media` |
| `make status` | Lists the containers and their state, as `docker compose ps` does |
| `make logs` | Follows the Django server's log. For another service, run `docker compose logs -f <service>`, with a service name from [`compose.yml`](https://github.com/suitenumerique/meet/blob/main/compose.yml) |
| `make demo` | Empties the database, recreates the Django admin and creates the demo users. It asks for confirmation unless you add `FLUSH_ARGS='--no-input'` |
| `make resetdb` | Empties the database and recreates the Django admin, without the demo users |
| `make superuser` | Creates the Django admin `admin@example.com` with password `admin`, or resets that password if the account exists |
| `make help` | Lists the `make` targets with their one-line descriptions. A bare `make` runs it too |
| `make clean` | Runs `git clean -idx`: lists every untracked or ignored file, your env files, `data/` and `node_modules/` included, and asks before deleting them |

### LiveKit agents

The subtitles agent and the metadata collector each hold a LiveKit connection and cost CPU and memory, so `make run` leaves them off. With its agent stopped, a feature fails silently: the backend still sends it work.

| Command | What it does |
|---|---|
| `make run-agent-multi-user-transcriber` | Starts the subtitles agent. Enable it with [`ROOM_SUBTITLE_ENABLED`](../reference/env-variables.md#subtitles) in `env.d/development/common`, and give it a speech-to-text provider in `env.d/development/multi_user_transcriber`, see [Subtitles agent](../reference/env-variables.md#subtitles-agent) |
| `make run-agent-metadata-collector` | Starts the metadata collector, which records who speaks when during a transcription. Enable it with [`METADATA_COLLECTOR_ENABLED`](../reference/env-variables.md#metadata-collector) in `env.d/development/common` |
| `make run-agents` | Starts both |

After changing either setting, run `make run-backend` so the backend reads the new value.

### Files in storage

Recordings, transcripts and summaries sit in Garage, which keeps them in its own format under `data/media`. These targets list them and copy them out:

| Command | What it does |
|---|---|
| `make recordings-list` | Lists the recordings, most recent first, with date, key and size |
| `make recordings-download-latest` | Copies the most recent recording into `data/recordings/` |
| `make transcripts-list`, `make transcripts-download-latest` | The same for transcripts, into `data/transcripts/` |
| `make summaries-list`, `make summaries-download-latest` | The same for summaries, into `data/summaries/` |

## Work on the backend

The `app-dev` container runs Django's development server with [`src/backend`](https://github.com/suitenumerique/meet/tree/main/src/backend) mounted at `/app`, so saving a Python file restarts the server. The Celery worker, `celery-dev`, does not reload: run `make run-backend` to restart it after changing a task.

The container runs the `Development` configuration, which turns on debug mode and the API schema pages. Its settings come from `env.d/development/common` and `env.d/development/postgresql`; each is in [Environment variables](../reference/env-variables.md).

| Command | What it does |
|---|---|
| `make makemigrations` | Starts PostgreSQL, then creates a migration in `src/backend/core/migrations/` for every model change. Commit the new file with the change |
| `make migrate` | Starts PostgreSQL, then applies the migrations. Run it after pulling a branch that adds one |
| `make shell` | Opens a Django shell in a new `app-dev` container |
| `make dbshell` | Opens `psql` on the database, inside the running `app-dev` container. The stack must be up |
| `bin/manage <command>` | Runs any `manage.py` command in a new `app-dev` container under `Development`, for example `bin/manage showmigrations` |
| `make back-i18n-generate`, `make back-i18n-compile` | Extract and compile the backend's translatable strings, see [Translations](#translations) |

## Work on the frontend

The `frontend` container on port 3000 serves a production build of [`src/frontend`](https://github.com/suitenumerique/meet/tree/main/src/frontend) from nginx: it shows a change only after `make build-frontend` and `make run`. Its build-time variables are under [Frontend](../reference/env-variables.md#frontend). For daily work, run the Vite dev server on your machine instead; it reloads the page on every save:

| Command | What it does |
|---|---|
| `make run-backend` | Starts the backend and its services, without the frontend container |
| `make frontend-development-install` | Runs `npm install` in `src/frontend`. Run it once, and again when `package-lock.json` changes |
| `make run-frontend-development` | Stops the frontend container, then runs `npm run dev`: it generates the Panda CSS code, then serves the app on <http://localhost:3000> with hot reload. It calls the API on <http://localhost:8071>, from [`.env.development`](https://github.com/suitenumerique/meet/blob/main/src/frontend/.env.development) |
| `make build-frontend` | Rebuilds the frontend container's image. Run it before `make run` when you go back to the container |

Every `npm` script runs from `src/frontend`. The `make` targets above and below call the main ones; the others are:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks the code with `tsc`, then builds the production bundle into `dist/`. Run it to catch the type errors that fail CI's image build |
| `npm run build:debug` | Runs `npm run build` with a bundle size report, written to `rollup-plugin-visualizer/stats.html` and opened in your browser |
| `npm run preview` | Serves the last `npm run build` output, to check a production bundle |
| `npm run lint:fix` | Fixes what ESLint can fix by itself |
| `npm run check` | Checks the formatting without changing anything, as CI does: any file Prettier would change fails |

## Translations

The interface ships in English, French, German, Dutch and Spanish, and every string is translated in the pull request that adds it.

**Frontend.** A component reads its strings through `t()` from `react-i18next`, by key, from a namespace file in [`src/frontend/src/locales/<language>/`](https://github.com/suitenumerique/meet/tree/main/src/frontend/src/locales). [`HandToggle.tsx`](https://github.com/suitenumerique/meet/blob/main/src/frontend/src/features/rooms/livekit/components/controls/HandToggle.tsx) reads `controls.hand.raise` from `rooms.json`:

```tsx
const { t } = useTranslation('rooms', { keyPrefix: 'controls.hand' })
// ...
aria-label={t('raise')}
```

| Command | What it does |
|---|---|
| `make frontend-i18n-extract` | Runs `npm run i18n:extract`: adds each new `t()` key, empty, to the files of all five languages, removes unused keys and sorts the files. Fill in every empty value before you push: a missing translation shows in French |

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
| `make build-backend` | Rebuilds the backend image with the new dependency. `uv` exists only while the image builds, so it cannot install anything into a running container |
| `DOCKER_USER=$(id -u):$(id -g) docker compose up -d --force-recreate --renew-anon-volumes app-dev celery-dev` | Restarts the backend on the new image. The virtual environment sits in a volume a plain restart would keep from the old container; `--renew-anon-volumes` takes the new image's |
| `cd src/agents && uv add "<package>==<version>"`, then `make build-agents` | The same for the agents. `make build-agents` rebuilds the subtitles agent; rebuild the metadata collector with `docker compose build metadata-collector-dev` |
| `cd src/summary && uv add "<package>==<version>"`, then `docker compose build app-summary-dev celery-summary-transcribe celery-summary-summarize` | The same for the summary service, whose three containers each build their own image |
| `cd src/frontend && npm install --save-exact <package>@<version>` | Adds a frontend dependency to `package.json` and `package-lock.json`. Run `make build-frontend` if you use the frontend container |

## Tests

| Command | What it does |
|---|---|
| `make test` | Runs the backend suite in parallel, then the summary service suite, then the frontend suite, and stops at the first that fails. `ARGS` passes extra pytest arguments to the first two, as in `make test ARGS="-x"` |
| `make test-back` | Runs the backend suite on one process. `make test-back ARGS="core/tests/rooms/"` limits it to a directory |
| `make test-back-parallel` | Runs the backend suite on every CPU core, through pytest-xdist |
| `make test-summary` | Runs the summary service suite |
| `make test-frontend` | Runs `npm test` in `src/frontend`: it generates the Panda CSS code, then runs the Vitest suite once. It needs `make frontend-development-install` first |
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

The backend suite needs the `Test` configuration, which `bin/pytest` sets and CI uses. A bare `docker compose run app-dev pytest` runs under `Development`, where the external API and the add-ons are off, so their tests fail.

Backend tests live in [`src/backend/core/tests/`](https://github.com/suitenumerique/meet/tree/main/src/backend/core/tests): model tests as `test_models_<area>.py`, API tests as `test_api_<area>_*.py`, in a subdirectory such as `rooms/` or `recording/` where an area has many. They are plain pytest functions, marked with `pytest.mark.django_db` when they touch the database, calling the API through DRF's `APIClient`, and they build their data with the factories in [`core/factories.py`](https://github.com/suitenumerique/meet/blob/main/src/backend/core/factories.py). They use the real test database, and patch only what leaves the backend, such as `core.utils.create_livekit_client` for LiveKit or the S3 client. Frontend tests sit next to the code they test, as `*.test.ts` files.

The agents have no test suite. The SDK has none either, and CI builds it instead, see [Lint and format](#lint-and-format).

## Lint and format

The `make` targets fix what they can in place: `ruff format` rewrites files, `ruff check --fix` applies safe fixes. CI only checks, so run them before pushing and commit what they change.

| Command | What it does |
|---|---|
| `make lint` | Runs `make lint-back`, `make lint-agents` and `make lint-summary` |
| `make lint-back` | Runs `ruff format`, `ruff check --fix`, then `pylint` on the `meet`, `demo` and `core` packages, in a backend container started without its services |
| `make lint-agents`, `make lint-summary` | Runs `ruff format` and `ruff check --fix` on the agents or on the summary service |
| `make lint-ruff-format`, `make lint-ruff-check`, `make lint-pylint` | Runs one of the three backend steps alone. `make lint-pylint` checks the whole of `meet`, `demo` and `core`, although its help text says it checks only the files changed from `main` |
| `make frontend-lint` | Runs ESLint on the frontend, where any warning fails |
| `make frontend-format` | Runs Prettier on `src/frontend/src`, rewriting the files |
| `cd src/sdk/library && npm ci && npm run lint && npm run check && npm run build` | Lints, checks the formatting of, and builds the SDK, as CI does. Run it when you touch [`src/sdk`](https://github.com/suitenumerique/meet/tree/main/src/sdk) |

CI also checks commit messages, spelling and shell scripts; the local commands for those are in [What CI checks](pull-requests.md#what-ci-checks).

## Kubernetes with Tilt

[Tilt](https://tilt.dev/) runs Meet in a local Kubernetes cluster with the [Helm chart](https://github.com/suitenumerique/meet/tree/main/src/helm), close to production, and copies your edits into the running pods. Use it when a change touches the chart or depends on Kubernetes; Docker Compose covers the rest.

Besides Docker, it needs:

| Tool | What it is for |
|---|---|
| [kind](https://kind.sigs.k8s.io/) | The local cluster, whose nodes are Docker containers |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | Talking to the cluster |
| [Helm](https://helm.sh/) and [helmfile](https://helmfile.readthedocs.io/) | Rendering the chart and its development services from [`src/helm/helmfile.yaml.gotmpl`](https://github.com/suitenumerique/meet/blob/main/src/helm/helmfile.yaml.gotmpl) |
| [Tilt](https://docs.tilt.dev/install.html) | Building the images, deploying them and syncing your edits |
| [mkcert](https://github.com/FiloSottile/mkcert) | The local certificate authority behind the cluster's HTTPS |

| Command | What it does |
|---|---|
| `make build-k8s-cluster` | Run it once. Copies `env.d/development/kube-secret.dist`, then runs [`bin/start-kind.sh`](https://github.com/suitenumerique/meet/blob/main/bin/start-kind.sh), which downloads [`create_cluster.sh`](https://github.com/numerique-gouv/tools/blob/main/kind/create_cluster.sh) from `numerique-gouv/tools` and pipes it to `bash`: read that script first. It installs a local certificate authority with mkcert, starts an image registry on `localhost:5001`, and creates a kind cluster named `suite` whose ingress serves `*.127.0.0.1.nip.io` over HTTPS |
| `make start-tilt-keycloak` | Runs `tilt up` with [`bin/Tiltfile`](https://github.com/suitenumerique/meet/blob/main/bin/Tiltfile) in the `meet` namespace, signing in through a Keycloak deployed in the cluster. It builds the backend, frontend, summary, agents and LiveKit images, deploys the chart, then applies the migrations and creates the Django admin once |
| `make start-tilt-dinum` | The same, with the DINUM-styled frontend from [`docker/dinum-frontend`](https://github.com/suitenumerique/meet/tree/main/docker/dinum-frontend) |
| `tilt down --namespace=meet -f ./bin/Tiltfile` | Deletes what Tilt deployed. Stopping `tilt up` with Ctrl+C leaves the deployment running |
| `kind delete cluster --name suite` | Deletes the cluster |

Tilt's dashboard is at <http://localhost:10350/> and Meet at <https://meet.127.0.0.1.nip.io/>. On the `meet-backend` resource, the **Run makemigration** and **Run database migration** buttons run those commands in the backend pod.

## Work on this documentation site

[Zensical](https://zensical.org/) builds this site from the Markdown in [`docs/`](https://github.com/suitenumerique/meet/tree/main/docs); its name and navigation are in [`zensical.toml`](https://github.com/suitenumerique/meet/blob/main/zensical.toml). It needs only Docker. Run each command from the repository root:

| Command | What it does |
|---|---|
| `docker run --rm -it -p 8000:8000 -v "$PWD":/docs zensical/zensical` | Serves the site on <http://localhost:8000> and rebuilds a page when you save its file |
| `docker run --rm -v "$PWD":/docs zensical/zensical build` | Builds the static site, the plain files a web server hosts, into `site/`, which Git ignores |
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

    Two screenshots side by side go in one `<div class="figure-row" markdown>`, and stack on a narrow screen. Images live in [`docs/assets/`](https://github.com/suitenumerique/meet/tree/main/docs/assets).
- **An icon inside a sentence or a table carries `class="off-glb"`**, which keeps it out of the lightbox that opens screenshots full size: `<img class="off-glb" src="../assets/icons/mic-line.svg" width="20" />`.
- **A new page is added to `nav` in `zensical.toml`**, or it builds without appearing in the navigation.

CI's spelling and shellcheck jobs cover `docs/` too, see [What CI checks](pull-requests.md#what-ci-checks).
