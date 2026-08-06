/// <reference types="vite/client" />

// Version of @mediapipe/tasks-vision, injected at build time (vite.config.ts).
declare const __MEDIAPIPE_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
