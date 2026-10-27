# Pull requests

How a change goes from your fork into `main`. [`CONTRIBUTING.md`](https://github.com/suitenumerique/meet/blob/main/CONTRIBUTING.md) is the project's short version, and also covers writing an issue. [Develop locally](develop.md) covers setting up the code.

## TL;DR

```bash
# 1. Branch from the latest main of the project
git fetch upstream && git switch -c my-change upstream/main
# 2. Commit with a gitmoji, a scope, a lowercase subject and a body, then add a CHANGELOG.md line
git commit
# 3. Check the commit messages the way CI does
uvx --from gitlint-core gitlint --commits upstream/main..HEAD
# 4. Run every test suite and every linter
make test && make lint && make frontend-lint && make frontend-format
# 5. Push to your fork and open the pull request against main
git push -u origin my-change
```

## Before you start

- A small fix, a typo or an obvious bug, can go straight to a pull request.
- Before a larger change, or one written with the help of AI, agree on the approach with a maintainer on the [Matrix channel](https://matrix.to/#/#meet-official:matrix.org), as the [README](https://github.com/suitenumerique/meet/blob/main/README.md#contributing) asks.
- Other places to ask are under [Community and support](../index.md#community-and-support).

With an AI coding assistant, point it at these pages: [Develop locally](develop.md) explains every command, and [What CI checks](#what-ci-checks) gives the local command for each CI job.

## Workflow

1. Fork [suitenumerique/meet](https://github.com/suitenumerique/meet) on GitHub, clone your fork, and add the project as a second remote:

    ```bash
    git clone https://github.com/<you>/meet.git && cd meet
    git remote add upstream https://github.com/suitenumerique/meet.git
    ```

2. Create a branch from the project's latest `main`:

    ```bash
    git fetch upstream
    git switch -c my-change upstream/main
    ```

3. Commit in steps, each one change that builds and passes the tests on its own: maintainers may merge commits as they are.
4. Add a line to `CHANGELOG.md`, see [Changelog](#changelog).
5. Go through the [checklist](#checklist).
6. Push to your fork and open the pull request against `main`. Say what the change is for, and add screenshots or a short video when the interface changes.
7. To bring the branch up to date, rebase it rather than merging `main` into it:

    ```bash
    git fetch upstream
    git rebase upstream/main
    git push --force-with-lease
    ```

## Commit messages

```
✨(frontend) add a shortcut to copy the room link

Copying the link took three clicks through the information panel. Bind
Ctrl+Shift+L to copy it, and announce the result to screen readers.
```

The title is a [gitmoji](https://gitmoji.dev/), a scope in parentheses, a space and a lowercase subject. CI checks every commit with gitlint, using [`.gitlint`](https://github.com/suitenumerique/meet/blob/main/.gitlint) and the rule in [`gitlint/gitlint_emoji.py`](https://github.com/suitenumerique/meet/blob/main/gitlint/gitlint_emoji.py):

| Rule | What fails it |
|---|---|
| Title shape | Anything other than `<gitmoji>(<scope>) <subject>`, or a subject that does not start with a lowercase letter |
| Title length | More than 72 characters |
| Title ending | A full stop or other punctuation at the end |
| Work in progress | The word `wip` anywhere in the title |
| Body | No body, or one shorter than 20 characters. Dependency upgrades (title starting with ⬆️) need neither a body nor the title shape; releases (🔖) need no body |
| Body width | A body line longer than 80 characters |

Run the same check before pushing, from the repository root. It needs network access: the gitmoji rule downloads the gitmoji list.

```bash
uvx --from gitlint-core gitlint --commits upstream/main..HEAD
```

The [devenv shell](develop.md#prerequisites) installs gitlint as a commit-message hook, so it runs on every commit.

### Scopes

The scope names the part of the repository the commit changes. gitlint accepts any word; these are the most used:

| Scope | Part of the repository |
|---|---|
| `backend` | `src/backend` |
| `frontend` | `src/frontend` |
| `summary` | `src/summary` |
| `agents` | `src/agents` |
| `addons` | `src/addons` |
| `helm` | `src/helm` |
| `docker`, `compose` | The Dockerfiles, `compose.yml` and `docker/` |
| `ci` | `.github/workflows` |
| `dev`, `devx` | Development tooling, such as the `Makefile`, `bin/` or devenv |
| `docs` | `docs/`, `UPGRADE.md` and the other Markdown files |
| `all` | A change spanning several of the above |

### Gitmojis

The most used, with their [gitmoji.dev](https://gitmoji.dev/) meaning:

| Gitmoji | Use it for |
|---|---|
| ✨ | A new feature |
| 🐛 | A bug fix |
| 🩹 | A simple fix for a non-critical issue |
| 🔒️ | A security fix, a dependency upgrade for a vulnerability included |
| ⬆️ | A dependency upgrade |
| ♻️ | A refactor that changes no behaviour |
| ⚡️ | A performance improvement |
| 🔧 | A configuration change |
| ♿️ | An accessibility improvement |
| 💄 | A visual or style change |
| 🌐 | Translations |
| ✅ | Tests added or fixed |
| 👷 | The CI configuration |
| 🔥 | Code or files removed |
| 📝 | Documentation |

## Changelog

Every pull request adds one line to [`CHANGELOG.md`](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md), under `## [Unreleased]`, in `### Added`, `### Changed` or `### Fixed`. The line is usually the commit title, ended with the pull request number as [`CONTRIBUTING.md`](https://github.com/suitenumerique/meet/blob/main/CONTRIBUTING.md#changelog-update) suggests:

```markdown
## [Unreleased]

### Added

- ✨(frontend) add a shortcut to copy the room link #1234
```

CI fails the pull request when:

- `CHANGELOG.md` is unchanged, unless a maintainer adds the `noChangeLog` label.
- A line other than a link reference is 80 columns wide or more. `wc -L` counts screen columns, so an emoji such as ✨ can count as two: leave a margin.

## What CI checks

Every job below runs on each pull request to `main`, most through shared workflows from [suitenumerique/ci](https://github.com/suitenumerique/ci). Wait for all of them to pass before asking for a review, as `CONTRIBUTING.md` asks.

| Workflow | What fails it | Run it locally |
|---|---|---|
| [Project quality](https://github.com/suitenumerique/meet/blob/main/.github/workflows/code-quality.yml), commits | An added line containing `print(` in `src/backend`, `src/summary` or `src/agents`; a commit whose subject starts with `fixup!` or `squash!`; a commit message gitlint rejects | `git diff upstream/main..HEAD -- src/backend src/summary src/agents \| grep -E '^\+.*\bprint\('` must print nothing, then the gitlint command above |
| Project quality, spelling | A word [codespell](https://github.com/codespell-project/codespell) knows as a typo, in a file or a file name, docs included | `uvx codespell`, which reads [`.codespellrc`](https://github.com/suitenumerique/meet/blob/main/.codespellrc) |
| Project quality, shell scripts | A [shellcheck](https://www.shellcheck.net/) warning in any `.sh` file | `shellcheck --external-sources <file>.sh` |
| [Changelog](https://github.com/suitenumerique/meet/blob/main/.github/workflows/changelog.yml) | No change to `CHANGELOG.md`, or a line too wide, see [Changelog](#changelog) | `grep -Ev '^\[.*\]: https://github.com' CHANGELOG.md \| wc -L` must print less than 80 |
| [CI](https://github.com/suitenumerique/meet/blob/main/.github/workflows/ci.yml), Python lint | `ruff format` would change a file or `ruff check` reports a problem, in the backend, the agents or the summary service, or `pylint` reports one in the backend | `make lint`, then commit what it changed |
| CI, backend tests | A failing backend test, run under the `Test` configuration | `make test-back-parallel` |
| CI, summary tests | A failing summary service test | `make test-summary` |
| CI, frontend lint and tests | An ESLint warning, a file Prettier would change, or a failing Vitest test | `make frontend-lint`, `make frontend-format`, `make test-frontend` |
| CI, SDK | A lint or format problem in `src/sdk/library`, or a build failure | The SDK command in [Lint and format](develop.md#lint-and-format) |
| [Docker Hub](https://github.com/suitenumerique/meet/blob/main/.github/workflows/docker-hub.yml) | A backend, frontend, DINUM frontend, summary or agents image that does not build, a TypeScript error included, or a HIGH or CRITICAL vulnerability [Trivy](https://trivy.dev/) finds in it. Nothing is published, except from a branch named `integration/…` | `npm run build` in `src/frontend` for the type errors, `docker build --build-arg DOCKER_USER=$(id -u):$(id -g) --target backend-production .` for the backend image |
| [Security analysis](https://github.com/suitenumerique/meet/blob/main/.github/workflows/security.yml) | A [zizmor](https://docs.zizmor.sh/) finding in `.github/workflows/` | `uvx zizmor .github/workflows` |

## Checklist

Before asking for a review:

- [ ] Each commit passes gitlint, and none is a `fixup!` or `squash!` commit.
- [ ] `CHANGELOG.md` has a line for the change, narrower than 80 columns.
- [ ] The change has tests, and `make test` passes.
- [ ] `make lint`, `make frontend-lint` and `make frontend-format` leave nothing new to commit.
- [ ] A model change comes with its migration, from `make makemigrations`.
- [ ] An API change is reflected in the [API reference](../reference/api.md).
- [ ] Every new or changed string is translated in the five frontend languages, and in the backend catalogues when it is a backend string, see [Translations](develop.md#translations).
- [ ] An interface change works with the keyboard alone, every control has a name a screen reader reads, and the description shows it with screenshots.
- [ ] A new or changed setting is documented in [Environment variables](../reference/env-variables.md), and a user-visible change on the page that describes the feature.
- [ ] A change that asks operators to do something when they upgrade is described in [`UPGRADE.md`](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md).
- [ ] No secret, password or key is committed.

## Code review

A maintainer reviews the pull request. Keep it to one change: a fix and a refactor go in two pull requests, so neither waits on the other.

CI rejects `fixup!` commits, so a review fix goes into the commit it belongs to, not a new one on top:

```bash
# Record the fix against the commit it amends
git commit --fixup=<sha of that commit>
# Fold every fixup into its target
git rebase -i --autosquash upstream/main
# Replace the branch on your fork
git push --force-with-lease
```

## Security

Never report, discuss or fix a vulnerability in a public issue or pull request first: report it privately, as [Reporting a vulnerability](../index.md#reporting-a-vulnerability) describes. The maintainers prepare the fix and publish it with the release.
