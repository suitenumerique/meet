# Contributing to the Project

Thank you for taking the time to contribute! Please follow these guidelines to ensure a smooth and productive workflow. 🚀🚀🚀

To get started with the project, please refer to the [README.md](https://github.com/suitenumerique/meet/blob/main/README.md) for detailed instructions.

Please also check out our [dev handbook](https://suitenumerique.gitbook.io/handbook) to learn our best practices.


## Before You Start

- A small fix, a typo or an obvious bug, can go straight to a pull request.
- Before a larger change, or one written with the help of AI, agree on the approach with a maintainer on the [Matrix channel](https://matrix.to/#/#meet-official:matrix.org), as the [README](https://github.com/suitenumerique/meet/blob/main/README.md#contributing) asks.
- [Develop locally](https://documentation-meet.beta.numerique.gouv.fr/contributing/develop/) sets up the code and explains every command. With an AI coding assistant, point it at that page and at [What CI Checks](#what-ci-checks).


## Creating an Issue

When creating an issue, please provide the following details:

1.  **Title**: A concise and descriptive title for the issue.
2.  **Description**: A detailed explanation of the issue, including relevant context or screenshots if applicable.
3.  **Steps to Reproduce**: If the issue is a bug, include the steps needed to reproduce the problem.
4.  **Expected vs. Actual Behavior**: Describe what you expected to happen and what actually happened.
5.  **Labels**: Add appropriate labels to categorize the issue (e.g., bug, feature request, documentation).


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
4. Add a line to `CHANGELOG.md`, as [Changelog Update](#changelog-update) describes.
5. Go through the [Checklist](#checklist).
6. Push to your fork and open the pull request against `main`.
7. To bring the branch up to date, rebase it rather than merging `main` into it:

    ```bash
    git fetch upstream
    git rebase upstream/main
    git push --force-with-lease
    ```

## Commit Message Format

All commit messages must adhere to the following format:

```
<gitmoji>(<scope>) <title>

<description>
```

*   <**gitmoji**>: Use a gitmoji to represent the purpose of the commit. For example, ✨ for adding a new feature or 🔥 for removing something. Copy it from the list at <https://gitmoji.dev/>: some, such as 🔒️, end in an invisible character that an emoji picker can leave out, and gitlint then rejects the title.
*   **(scope)**: The part of the repository the change touches, such as `backend`, `frontend`, `summary`, `helm`, `ci` or `docs`.
*   **title**: A short, descriptive title for the change, starting with a lowercase character.
*   **description**: Include additional details about what was changed and why.

To see the scopes in use, most used first:

```bash
git log -300 --format=%s upstream/main | sed -n 's/^[^(]*(\([^)]*\)).*/\1/p' |
  sort | uniq -c | sort -rn
```

CI checks every commit with gitlint, using [`.gitlint`](https://github.com/suitenumerique/meet/blob/main/.gitlint) and the rule in [`gitlint/gitlint_emoji.py`](https://github.com/suitenumerique/meet/blob/main/gitlint/gitlint_emoji.py). Run the same check before pushing:

```bash
# From the repository root, with network access:
# the gitmoji rule downloads the gitmoji list
uvx --from gitlint-core gitlint --commits upstream/main..HEAD
```

The [devenv shell](https://documentation-meet.beta.numerique.gouv.fr/contributing/develop/#nix-with-devenv) installs gitlint as a commit-message hook, so it runs on every commit.

### Example Commit Message

```
✨(frontend) add user authentication logic

Implemented login and signup features, and integrated OAuth2 for social login.
```

## Changelog Update

Please add a line to the [changelog](https://github.com/suitenumerique/meet/blob/main/CHANGELOG.md) describing your development, under `## [Unreleased]`, in the `### Added`, `### Changed` or `### Fixed` section. The changelog entry should include a brief summary of the changes, this helps in tracking changes effectively and keeping everyone informed. The line is usually the commit title, sometimes ended with the pull request number.

CI fails the pull request when:

- `CHANGELOG.md` is unchanged, unless a maintainer adds the `noChangeLog` label.
- A line other than a link reference is 80 characters or more. The `wc -L` command in [What CI Checks](#what-ci-checks) checks it: in a UTF-8 terminal it counts most gitmojis as two columns, so it can read more than CI does, and a line under 80 there passes.

### Example Changelog Message
```
## [Unreleased]

### Added

- ✨(frontend) add AI to the project #321
```

## What CI Checks

These jobs run on each pull request to `main`, most through shared workflows from [suitenumerique/ci](https://github.com/suitenumerique/ci). Each one runs locally:

| Workflow | Run it locally |
|---|---|
| [Project quality](https://github.com/suitenumerique/meet/blob/main/.github/workflows/code-quality.yml), commits | `git diff upstream/main..HEAD -- src/backend src/summary src/agents \| grep -E '^\+.*\bprint\('` must print nothing, then the gitlint command of [Commit Message Format](#commit-message-format) and the `fixup!` check of [Code Review](#code-review) |
| Project quality, spelling | `uvx codespell`, which reads [`.codespellrc`](https://github.com/suitenumerique/meet/blob/main/.codespellrc) |
| Project quality, shell scripts | `shellcheck --external-sources <file>.sh` |
| [Changelog](https://github.com/suitenumerique/meet/blob/main/.github/workflows/changelog.yml) | `grep -Ev '^\[.*\]: https://github.com' CHANGELOG.md \| wc -L` must print less than 80 |
| [CI](https://github.com/suitenumerique/meet/blob/main/.github/workflows/ci.yml), Python lint | `make lint`, then commit what it changed |
| CI, backend tests | `make test-back-parallel` |
| CI, summary tests | `make test-summary` |
| CI, frontend lint and tests | `make frontend-lint`, `make frontend-format`, `make test-frontend` |
| CI, SDK | `cd src/sdk/library && npm ci && npm run lint && npm run check && npm run build` |
| [Docker Hub](https://github.com/suitenumerique/meet/blob/main/.github/workflows/docker-hub.yml) | `npm run build` in `src/frontend` for the type errors; `docker build --build-arg DOCKER_USER=$(id -u):$(id -g) --target backend-production .` for the backend, and `--target production` in `src/summary` or `src/agents` when you touch them. CI also fails an image on a HIGH or CRITICAL Trivy finding |
| [Security analysis](https://github.com/suitenumerique/meet/blob/main/.github/workflows/security.yml) | `uvx zizmor .github/workflows` |

## Pull Requests

It is nice to add information about the purpose of the pull request to help reviewers understand the context and intent of the changes. If you can, add some pictures or a small video to show the changes.

### Checklist

- [ ] Every job in [What CI Checks](#what-ci-checks) passes locally.
- [ ] The change has tests.
- [ ] A model change comes with its migration, from `make makemigrations`.
- [ ] An External API change is reflected in [`docs/reference/openapi.yaml`](https://github.com/suitenumerique/meet/blob/main/docs/reference/openapi.yaml), and in `resource_server.yaml` beside it when the user's OIDC token routes change.
- [ ] Every new or changed string is translated in the five frontend languages, and in the backend catalogues when it is a backend string, see [Translations](https://documentation-meet.beta.numerique.gouv.fr/contributing/develop/#translations).
- [ ] An interface change works with the keyboard alone, every control has a name a screen reader reads, and the description shows it with screenshots.
- [ ] A new or changed setting is documented in [Environment variables](https://documentation-meet.beta.numerique.gouv.fr/reference/env-variables/), and a user-visible change on the page that describes the feature.
- [ ] A change that asks operators to do something when they upgrade is described in [`UPGRADE.md`](https://github.com/suitenumerique/meet/blob/main/UPGRADE.md).
- [ ] No secret, password or key is committed.

Once all the required tests have passed, you can request a review from the project maintainers.

## Code Review

A maintainer reviews the pull request. Keep it to one change: a fix and a refactor go in two pull requests, so neither waits on the other.

CI rejects `fixup!` and `squash!` commits, so a review fix goes into the commit it belongs to, not a new one on top:

```bash
# Record the fix against the commit it amends
git commit --fixup=<sha of that commit>
# Fold every fixup into its target: save the list the editor opens.
# Keep -i: Git before 2.44 ignores --autosquash without it.
git rebase -i --autosquash upstream/main
# Check that no fixup! or squash! title remains: this prints nothing
git log --format=%s upstream/main..HEAD | grep -E '^(fixup|squash)!'
# Replace the branch on your fork
git push --force-with-lease
```

## Code Style

Please maintain consistency in code style. Run any linting tools available to make sure the code is clean and follows the project's conventions.

## Tests

Make sure that all new features or fixes have corresponding tests. Run the test suite before pushing your changes to ensure that nothing is broken.

## Security

Never report, discuss or fix a vulnerability in a public issue or pull request first: report it privately, as [SECURITY.md](https://github.com/suitenumerique/meet/blob/main/SECURITY.md) describes.

## Asking for Help

If you need any help while contributing, feel free to open a discussion or ask for guidance in the issue tracker. We are more than happy to assist!

Thank you for your contributions! 👍
