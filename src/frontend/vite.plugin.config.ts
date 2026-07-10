import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// External-bundle build preset for deploy-time plugins: a single self-registering
// UMD/IIFE whose shared singletons are `external`, bound via `output.globals` to
// the host globals from `plugins/host.ts#publishHostGlobals`. `output.globals` is
// honored only for umd/iife (not ESM), which is why bundles load as `<script>`s.
// Every key here MUST match a `window.*` the host publishes before boot.
const HOST_GLOBALS: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOMClient',
  'react/jsx-runtime': 'ReactJSXRuntime',
  valtio: '__MEET_VALTIO__',
  'livekit-client': '__MEET_LIVEKIT_CLIENT__',
  '@livekit/components-react': '__MEET_LIVEKIT_COMPONENTS__',
}

// Overridable via env so the same preset builds any plugin (smoke is the default).
const entry = process.env.PLUGIN_ENTRY ?? 'plugin-examples/smoke/index.tsx'
const name = process.env.PLUGIN_NAME ?? 'smoke'
const globalName = process.env.PLUGIN_GLOBAL ?? 'MeetPluginBundle'
const outDir = process.env.PLUGIN_OUTDIR ?? 'dist-plugins'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bundled deps read `process.env.NODE_ENV` at init; a browser IIFE has no
  // `process`, so an unreplaced reference throws before the bundle self-registers.
  // Replace it at build time.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry: resolve(process.cwd(), entry),
      name: globalName,
      formats: ['umd'],
      fileName: () => `${name}.umd.js`,
    },
    rollupOptions: {
      external: Object.keys(HOST_GLOBALS),
      output: {
        globals: HOST_GLOBALS,
        // A bundled CJS dep can emit a runtime `require("react")` for an external
        // module; in a browser IIFE `require` is undefined and throws before
        // self-register. Provide an IIFE-scoped `require` (via `intro`) that maps
        // the externalized specifiers to the same host globals.
        intro:
          'var require=function(m){var g={' +
          Object.entries(HOST_GLOBALS)
            .map(([k, v]) => `"${k}":window.${v}`)
            .join(',') +
          '};if(Object.prototype.hasOwnProperty.call(g,m))return g[m];' +
          'throw new Error("[meet-plugin] cannot require external module: "+m);};',
      },
    },
  },
})
