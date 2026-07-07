/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_TITLE: string
  /** JSON array of deploy-time plugin bundle refs (see `plugins/loader.ts`). */
  readonly VITE_PLUGIN_BUNDLES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** What a deploy-time plugin bundle self-registers with the host. */
interface MeetRegisteredPlugin {
  activate(host: unknown): void | Promise<void>
}

interface Window {
  VITE_CONFIG?: Partial<Record<keyof ImportMetaEnv, string>>
  // Host singletons published before any bundle loads; bundles bind these as
  // externals so their bare imports resolve to the one host instance.
  React?: typeof import('react')
  ReactDOM?: typeof import('react-dom')
  ReactDOMClient?: typeof import('react-dom/client')
  ReactJSXRuntime?: typeof import('react/jsx-runtime')
  __MEET_VALTIO__?: typeof import('valtio')
  __MEET_LIVEKIT_CLIENT__?: typeof import('livekit-client')
  __MEET_LIVEKIT_COMPONENTS__?: typeof import('@livekit/components-react')
  // Bundle self-registration channel (set by the host, called by each bundle).
  __MEET_PLUGINS__?: Record<string, MeetRegisteredPlugin>
  __meetRegisterPlugin__?: (id: string, mod: MeetRegisteredPlugin) => void
}
