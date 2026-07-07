import { getEnv } from '@/utils/getEnv'
import { satisfies } from './semver'
import {
  buildHost,
  publishHostGlobals,
  HOST_API_VERSION,
  HOST_PEERS,
  type MeetPluginHost,
} from './host'

/**
 * A deploy-time bundle ref from `VITE_PLUGIN_BUNDLES`. `url` is a UMD/IIFE bundle
 * that self-registers via `window.__meetRegisterPlugin__(id, module)` on eval.
 */
export interface PluginBundleRef {
  id: string
  url: string
  /** ABI version the bundle targets — caret-gated against `HOST_API_VERSION`. */
  apiVersion: string
  /** Optional major-version pins for shared singletons (see `HOST_PEERS`). */
  peers?: Record<string, string>
}

/** What a bundle self-registers: the entry point the host invokes post-load. */
export interface PluginModule {
  activate(host: MeetPluginHost): void | Promise<void>
}

/** Per-bundle load budget; a hung fetch/eval never blocks the others. */
const LOAD_TIMEOUT_MS = 10_000

/** Parse `VITE_PLUGIN_BUNDLES`; absent/empty/malformed → `[]` (never throws). */
export const parseRefs = (): PluginBundleRef[] => {
  const raw = getEnv('VITE_PLUGIN_BUNDLES')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PluginBundleRef[]) : []
  } catch {
    return []
  }
}

/** Compatibility gate: host must satisfy the bundle's `apiVersion` caret and every declared peer major. */
export const isCompatible = (ref: PluginBundleRef): boolean => {
  if (!satisfies(HOST_API_VERSION, `^${ref.apiVersion}`)) return false
  for (const [lib, major] of Object.entries(ref.peers ?? {})) {
    const hostMajor = HOST_PEERS[lib]
    if (hostMajor && hostMajor !== major) return false
  }
  return true
}

/**
 * Inject the bundle as a `<script>` and resolve once it self-registers under
 * `ref.id`. Owns its load budget: on load, error OR timeout the script node is
 * always removed. A bundle that registers after the timeout is never activated
 * (bootPlugins only activates the resolved module), so it leaves no live surface.
 */
const loadBundle = (ref: PluginBundleRef): Promise<PluginModule> =>
  new Promise<PluginModule>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.remove()
      done()
    }
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new Error(`bundle "${ref.id}" timed out after ${LOAD_TIMEOUT_MS}ms`))
        ),
      LOAD_TIMEOUT_MS
    )
    script.src = ref.url
    script.async = true
    script.onload = () =>
      finish(() => {
        const mod = window.__MEET_PLUGINS__?.[ref.id] as PluginModule | undefined
        if (!mod) reject(new Error(`bundle "${ref.id}" loaded but did not register`))
        else resolve(mod)
      })
    script.onerror = () =>
      finish(() =>
        reject(new Error(`bundle "${ref.id}" failed to load from ${ref.url}`))
      )
    document.head.appendChild(script)
  })

/**
 * Boot every configured plugin bundle. Publishes host globals first, then loads
 * and activates each ref independently: an incompatible, slow, or throwing
 * bundle is skipped without affecting the others (a bad deploy config degrades
 * gracefully instead of taking the app down).
 */
export const bootPlugins = async (): Promise<void> => {
  publishHostGlobals()
  const refs = parseRefs()
  if (refs.length === 0) return

  const host = buildHost()
  await Promise.allSettled(
    refs.map(async (ref) => {
      if (!isCompatible(ref)) {
        console.error(
          `[plugins] skipping "${ref.id}": incompatible (apiVersion "${ref.apiVersion}", peers ${JSON.stringify(ref.peers ?? {})}, host "${HOST_API_VERSION}")`
        )
        return
      }
      try {
        const mod = await loadBundle(ref)
        await mod.activate(host)
      } catch (error) {
        console.error(`[plugins] failed to load/activate "${ref.id}"`, error)
      }
    })
  )
}
