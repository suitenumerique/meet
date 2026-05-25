import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [
      react(),
      tsconfigPaths(),
      env.VITE_ANALYZE === 'true' && visualizer({
        open: true,
        filename: 'rollup-plugin-visualizer/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ],
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
