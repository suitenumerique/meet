# Playwright E2E Tests in CI

## Overview

Playwright E2E tests run automatically in GitHub Actions on every push and pull request.

## Workflow

The workflow (`.github/workflows/playwright.yml`) performs the following:

1. **Checks out the repository**
2. **Sets up Node.js 20** with npm caching
3. **Installs frontend dependencies** (`npm ci`)
4. **Installs Playwright browsers** (Chromium only for CI speed)
5. **Runs Playwright tests** - The Playwright config automatically starts the dev server
6. **Uploads test reports** - HTML reports are uploaded as artifacts
7. **Uploads test artifacts** - Screenshots and videos on test failures

## Test Execution

- Tests run using Chromium browser in CI
- The dev server starts automatically via Playwright's `webServer` configuration
- Tests that require backend API will gracefully skip if backend is not available
- All tests run in parallel (with 1 worker in CI for stability)

## Viewing Results

After a workflow run:

1. Go to the **Actions** tab in GitHub
2. Click on the workflow run
3. Download the `playwright-report` artifact to view the HTML report
4. Download `playwright-test-results` artifact if tests failed (contains screenshots/videos)

## Future Enhancements

- Add full backend service integration for complete E2E testing
- Run tests on multiple browsers (Firefox, WebKit) in CI
- Add visual regression testing
- Integrate with test coverage reporting

