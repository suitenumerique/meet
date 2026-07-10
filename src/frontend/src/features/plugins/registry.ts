import { proxy, useSnapshot } from 'valtio'
import type { ApiConfig } from '@/api/useConfig'
import type { CaptionControllerContribution, Plugin } from './types'

/** Reverse-DNS `vendor.feature` id format: lowercase, kebab segments allowed. */
const ID_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/

const registry = new Map<string, Plugin>()

// Bumped on every mutation so render-time selector callers re-render; only this
// integer is proxied — Plugin objects never enter the reactive graph.
const registryVersion = proxy({ n: 0 })

/** Subscribe a component to registry mutations (re-render trigger only). */
export const useRegistryVersion = (): number => useSnapshot(registryVersion).n

/** DEV-only guard: reject a malformed or duplicate id before registering. */
const assertRegistrable = (id: string): void => {
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `[plugins] invalid id "${id}" — expected reverse-DNS vendor.feature (lowercase)`
    )
  }
  if (registry.has(id)) throw new Error(`[plugins] duplicate id "${id}"`)
}

/** Register a plugin. DEV throws on a malformed/duplicate id; prod warns then overwrites. */
export const registerPlugin = (p: Plugin): void => {
  if (import.meta.env.DEV) {
    assertRegistrable(p.id)
  } else if (registry.has(p.id)) {
    console.warn(
      `[plugins] duplicate id "${p.id}" — overwriting the previous registration`
    )
  }
  registry.set(p.id, p)
  registryVersion.n++
}

/** Test-only: clears the module-level registry between cases. */
export const __clearRegistry = (): void => {
  registry.clear()
  registryVersion.n++
}

/** All registered plugins, in insertion order. */
export const getToolPlugins = (): Plugin[] => [...registry.values()]

/** O(1) lookup of a registered plugin by id. */
export const getPlugin = (id: string): Plugin | undefined => registry.get(id)

/** The identity/gating subset the conflict resolver reads. */
interface Precedence {
  id: string
  order?: number
  isEnabled: (config?: ApiConfig) => boolean
  replaces?: (config?: ApiConfig) => string[]
}

/** Precedence: lower `order` wins, lexicographic `id` as tiebreak. */
const byPrecedence = (a: Precedence, b: Precedence): number =>
  (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Pure conflict resolver: filter by `isEnabled`, sort by precedence, then resolve
 * `replaces` in a single pass (an already-hidden plugin does NOT contribute its
 * own `replaces()`). Deterministic, independent of registration order.
 */
export const resolveVisiblePlugins = <T extends Precedence>(
  all: T[],
  config?: ApiConfig
): T[] => {
  const enabled = all.filter((p) => p.isEnabled(config)).sort(byPrecedence)
  const hidden = new Set<string>()
  for (const p of enabled) {
    if (hidden.has(p.id)) {
      // Hidden by a higher-precedence plugin, so its replaces() is ignored.
      if (import.meta.env.DEV && (p.replaces?.(config) ?? []).length > 0) {
        console.warn(
          `[plugins] "${p.id}" is hidden by a higher-precedence plugin; its replaces() is ignored.`
        )
      }
      continue
    }
    for (const v of p.replaces?.(config) ?? []) hidden.add(v)
  }
  const visible = enabled.filter((p) => !hidden.has(p.id))

  // Deployment force-hide (config.hidden_tools). An admin who force-hides every
  // tool gets an empty menu — their explicit choice, no un-hide guard.
  const forceHidden = new Set(config?.hidden_tools ?? [])
  if (forceHidden.size === 0) return visible
  return visible.filter((p) => !forceHidden.has(p.id))
}

/**
 * Resolve the visible tool plugins over the live registry. Plain selector, not a
 * hook — render-time callers pair it with useRegistryVersion() for reactivity.
 */
export const getVisibleToolPlugins = (config?: ApiConfig): Plugin[] =>
  resolveVisiblePlugins(
    getToolPlugins().filter((p) => p.contributes.tool),
    config
  )

/** A resolved caption controller tagged with its owning plugin id (stable key). */
export interface ResolvedCaptionController extends CaptionControllerContribution {
  pluginId: string
}

/**
 * Enabled caption-controller contributions, subject to the same visibility rules
 * as tools (`isEnabled`, `replaces`, `hidden_tools`) plus the contribution-level
 * `isEnabled` gate — a kill-listed plugin must not mount its controller either.
 */
export const getCaptionControllers = (
  config?: ApiConfig
): ResolvedCaptionController[] =>
  resolveVisiblePlugins(
    getToolPlugins().filter((p) => p.contributes.captionController),
    config
  )
    .map((p) => ({ ...p.contributes.captionController!, pluginId: p.id }))
    .filter((cc) => cc.isEnabled?.(config) ?? true)
