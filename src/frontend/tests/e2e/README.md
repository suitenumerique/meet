# E2E Tests with Playwright

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install
   ```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run tests in UI mode (recommended for debugging)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:e2e:headed
```

## Test Structure

- `home.spec.ts` - Tests for the home page
- `navigation.spec.ts` - Tests for navigation and routing

## Configuration

Tests are configured to automatically start the dev server at `http://localhost:3000`. 
Make sure the backend services are running if tests require API calls.

## Notes

- Tests will wait for the dev server to be ready before running
- Screenshots are captured on failure
- Traces are captured on first retry for debugging

