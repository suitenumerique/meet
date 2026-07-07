import { proxy } from 'valtio'

/**
 * One lazily-created valtio proxy per plugin id — a host-owned store shared
 * across a plugin's code-split surfaces (panel vs. headless controller), which
 * can't share a bundle-local store. Lives on the one host valtio instance.
 */
const ctxByPlugin = new Map<string, object>()

export const pluginContext = (id: string): object => {
  let ctx = ctxByPlugin.get(id)
  if (!ctx) {
    ctx = proxy({})
    ctxByPlugin.set(id, ctx)
  }
  return ctx
}
