import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so the tests load none of the build plugins.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
})
