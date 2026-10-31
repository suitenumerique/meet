import { existsSync, readFileSync } from 'node:fs'
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

const toolsModules = fileURLToPath(new URL('./node_modules', import.meta.url))
// What production ships is its lockfile, which is always checked in; its
// node_modules may not be installed (the tools CI job never installs it).
const shippedPackages: Record<string, { version: string }> = readPackageJson(
  frontendPath('package-lock.json')
).packages

/**
 * The copy of `name` that `parent` loads, resolved as Node does: nested under
 * the parent first, then hoisted. npm nests a package whenever an override or
 * a version conflict keeps it from being hoisted.
 */
const installedVersion = (name: string, parent?: string): string | null => {
  const dirs = [`${toolsModules}/${parent}/node_modules`, toolsModules]
  for (const dir of parent ? dirs : dirs.slice(1)) {
    const path = `${dir}/${name}/package.json`
    if (existsSync(path)) return readPackageJson(path).version
  }
  return null
}
const shippedVersion = (name: string, parent?: string): string | undefined =>
  (parent &&
    shippedPackages[`node_modules/${parent}/node_modules/${name}`]?.version) ||
  shippedPackages[`node_modules/${name}`]?.version

// A diagnostic is only meaningful against what production ships: every
// package both apps declare, and each runtime one's own dependencies (jose
// and loglevel arrive through livekit-client), must be installed here at the
// version production resolves for the same parent. Installed, not declared:
// a stale node_modules would otherwise pass.
const shared = Object.keys({
  ...toolsPackage.dependencies,
  ...toolsPackage.devDependencies,
}).filter(
  (name) =>
    name in frontendPackage.dependencies ||
    name in frontendPackage.devDependencies
)
// Dev tooling (vite, @types) never reaches the page, so only runtime
// dependencies are followed one level down.
const checked: Array<{ name: string; parent?: string }> = shared.map(
  (name) => ({ name })
)
for (const parent of shared.filter((n) => n in toolsPackage.dependencies)) {
  const path = `${toolsModules}/${parent}/package.json`
  if (!existsSync(path)) continue
  for (const name of Object.keys(readPackageJson(path).dependencies ?? {}))
    checked.push({ name, parent })
}

for (const { name, parent } of checked) {
  const tools = installedVersion(name, parent)
  const shipped = shippedVersion(name, parent)
  if (tools && shipped && tools !== shipped) {
    const where = parent ? ` (under ${parent})` : ''
    throw new Error(
      `${name}@${tools}${where} is installed in src/frontend-tools, but ` +
        `src/frontend locks ${shipped}. Pin ${shipped} (under "overrides" ` +
        `when it is transitive), then npm install.`
    )
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
