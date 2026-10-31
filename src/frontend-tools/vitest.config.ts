import { defineConfig } from 'vitest/config'

// Standalone rather than picking up vite.config.ts: the unit-tested modules are
// pure and need none of its plugins, aliases or version checks.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
