import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [react(), tsconfigPaths()],
    server: {
      port: parseInt(env.VITE_PORT) || 3000,
      host: env.VITE_HOST ?? 'localhost',
      allowedHosts: ['.nip.io'],
    },
  }
})
