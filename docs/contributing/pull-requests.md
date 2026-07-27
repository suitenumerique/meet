# Pull Requests

## Before you start

- Introduce yourself in the Matrix channel - [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- Read the [developer handbook](https://suitenumerique.gitbook.io/handbook) for team best practices
- For significant changes, open an issue first to discuss the approach
- For small fixes (typos, obvious bugs), open a PR directly

## Workflow

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature` or `fix/my-bug`
3. Make your changes with tests
4. Run `make test-back` and `make lint-back lint-front`
5. Commit using the format below
6. Push and open a pull request against `main`

## Commit message format

Meet uses [Conventional Commits](https://www.conventionalcommits.org/) with gitmoji:

```
<emoji>(<scope>) <short description>
[required body]
```

### Scopes

| Scope | Purpose |
|---|---|
| `backend` | Django application |
| `frontend` | React/TypeScript |
| `helm` | Kubernetes Helm chart |
| `agents` | LiveKit agents |
| `summary` | Transcription/summary service |
| `docker` | Docker configuration |
| `deps` | Dependency updates |

### Common emojis

| Emoji | Meaning |
|---|---|
| ✨ | New feature |
| 🐛 | Bug fix |
| 🩹 | Minor fix |
| ♻️ | Refactor |
| 🔒️ | Security fix |
| ⬆️ | Dependency upgrade |
| ✅ | Tests |
| ♿️ | Accessibility |
| 💄 | UI/styling |
| 🌐 | i18n/translations |
| 📝 | Documentation |

For full emoji list, check [gitmoji](https://gitmoji.dev/)

### Examples

```
✨(frontend) add custom background upload with preview

🐛(backend) fix email disclosure in room invitation endpoint

🔒️(frontend) fix XSS vulnerability on recording download page

♿️(frontend) improve screen reader announcements for reactions

⬆️(backend) bump django to v5.2.13 [SECURITY]
```

Commit messages are validated by `gitlint` on push. Rules are in `gitlint/`.

## PR checklist

- [ ] Tests added for new functionality or the bug fix
- [ ] All tests pass (`make test-back`)
- [ ] Linters pass (`make lint-back lint-front`)
- [ ] If UI changed: keyboard navigation and screen reader labels work
- [ ] If new strings added: check translations in every languages
- [ ] No sensitive information (secrets, passwords) committed

## Code review

- The team follows extreme programming practices - expect prompt, thorough reviews
- Be responsive to feedback
- All CI checks must be green before merge
- Keep PRs focused - one thing per PR is easier to review and merge

## Translations

New UI strings must be added to `src/frontend/src/i18n/`.

## Security fixes

If your PR touches authentication, authorization, or any security-sensitive code:

- Tag the PR with the `security` label
- Request review from a core maintainer explicitly
- Add a regression test
- Do not disclose the vulnerability details publicly until the fix is merged

## After merging

Your contribution will appear in the next release's changelog. You'll be listed as a contributor at [github.com/suitenumerique/meet/graphs/contributors](https://github.com/suitenumerique/meet/graphs/contributors).

## Community

- Matrix: [#meet-official:matrix.org](https://matrix.to/#/#meet-official:matrix.org)
- GitHub Discussions: [github.com/suitenumerique/meet/discussions](https://github.com/suitenumerique/meet/discussions)
- Bug reports: [GitHub Issues](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md)
