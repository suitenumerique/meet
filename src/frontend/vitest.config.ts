import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Kept in step with vite.config.ts: a standalone vitest config replaces it
// rather than extending it, so anything tests rely on has to be repeated here.
// The `@/` alias mirrors vite.config.ts's `resolve.tsconfigPaths` (which is not
// in the vite version vitest bundles) and tsconfig.app.json's paths.
const mediapipeVersion = JSON.parse(
  readFileSync('./node_modules/@mediapipe/tasks-vision/package.json', 'utf-8')
).version

export default defineConfig({
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
