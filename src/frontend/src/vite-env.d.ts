/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
  readonly VITE_BRIDGE_TARGET_ORIGIN_ALLOWLIST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
