import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import svgr from 'vite-plugin-svgr'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const readPackageJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'))

const mediapipeVersion: string = readPackageJson(
  './node_modules/@mediapipe/tasks-vision/package.json'
).version

const livekitMediapipeVersion: string = readPackageJson(
  './node_modules/@livekit/track-processors/package.json'
).dependencies['@mediapipe/tasks-vision']

if (mediapipeVersion !== livekitMediapipeVersion) {
  throw new Error(
    `@mediapipe/tasks-vision@${mediapipeVersion} is installed, but ` +
      `@livekit/track-processors declares "${livekitMediapipeVersion}". ` +
      `The two must stay in sync: pin "@mediapipe/tasks-vision" to ` +
      `"${livekitMediapipeVersion}" in package.json.`
  )
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    define: {
      __MEDIAPIPE_VERSION__: JSON.stringify(mediapipeVersion),
    },
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          replaceAttrValues: {
            '#000': 'currentColor',
            '#000000': 'currentColor',
            '#1f1f1f': 'currentColor',
          },
        },
      }),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/@mediapipe/tasks-vision/wasm/*',
            dest: `assets/mediapipe/wasm/${mediapipeVersion}`,
            rename: { stripBase: 4 },
          },
          {
            // Kept out of public/ so the instance title reaches the manifest,
            // the way index.html gets it through %VITE_APP_TITLE%.
            src: 'site.webmanifest',
            dest: '.',
            transform: (content) => {
              const title = env.VITE_APP_TITLE
              return JSON.stringify({
                ...JSON.parse(content),
                name: title,
                short_name: title,
              })
            },
          },
        ],
      }),
      env.VITE_ANALYZE === 'true' &&
        visualizer({
          open: true,
          filename: 'rollup-plugin-visualizer/stats.html',
          gzipSize: true,
          brotliSize: true,
        }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
    },
    server: {
      port: parseInt(env.VITE_PORT) || 3000,
      host: env.VITE_HOST ?? 'localhost',
      allowedHosts: ['.nip.io'],
      // In a local dev setup, we proxy the media server ourselves to avoid CORS issues
      proxy: {
        '/media': {
          target: 'http://localhost:8083',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
