import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// The tools import meet's production code straight from src/frontend, so they
// share its sources, static assets and @/ alias.
const frontendPath = (path: string) =>
  fileURLToPath(new URL(`../frontend/${path}`, import.meta.url))

const readPackageJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf-8'))

const toolsPackage = readPackageJson(
  fileURLToPath(new URL('./package.json', import.meta.url))
)
const frontendPackage = readPackageJson(frontendPath('package.json'))

// A diagnostic is only meaningful against what production ships: every
// package both apps declare must be pinned to the same version.
for (const field of ['dependencies', 'devDependencies'] as const) {
  for (const [name, version] of Object.entries(toolsPackage[field])) {
    const shipped =
      frontendPackage.dependencies[name] ??
      frontendPackage.devDependencies[name]
    if (shipped && shipped !== version) {
      throw new Error(
        `${name}@${version} is pinned in src/frontend-tools, but ` +
          `src/frontend ships "${shipped}". Pin the same version in both.`
      )
    }
  }
}

const mediapipeVersion: string =
  toolsPackage.dependencies['@mediapipe/tasks-vision']

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/*',
          dest: `assets/mediapipe/wasm/${mediapipeVersion}`,
          rename: { stripBase: 4 },
        },
      ],
    }),
  ],
  // Models, backgrounds and overlay images the processors load at runtime.
  publicDir: frontendPath('public'),
  resolve: {
    alias: { '@': frontendPath('src') },
    // Modules under src/frontend must resolve these from this app's
    // node_modules, so the bench and the processors share one copy of each
    // (two livekit-client copies would break its instanceof checks).
    dedupe: Object.keys(toolsPackage.dependencies),
  },
  server: {
    port: 3001,
    fs: { allow: ['.', frontendPath('src')] },
  },
})
