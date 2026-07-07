// Minimal smoke plugin the CI gate builds through `vite.plugin.config.ts` to
// prove the external-bundle preset stays loadable and its externals bind to host
// globals. Self-registering UMD/IIFE: on eval it hands the host `{ activate }`.
import { proxy, useSnapshot } from 'valtio'

const PLUGIN_ID = 'example.smoke'

// Uses the host valtio singleton (external) — proves cross-boundary identity.
const state = proxy({ activated: false })

// Trivial panel; its JSX exercises `react/jsx-runtime` (external) to prove React is shared.
function SmokePanel() {
  const snap = useSnapshot(state)
  return <div data-testid="smoke-panel">smoke: {snap.activated ? 'on' : 'off'}</div>
}

interface PluginHostLike {
  registerPlugin(plugin: unknown): void
}

function activate(host: PluginHostLike): void {
  state.activated = true
  host.registerPlugin({
    id: PLUGIN_ID,
    apiVersion: '1.0.0',
    i18nNamespace: 'example-smoke',
    isEnabled: () => true,
    contributes: {
      tool: {
        icon: null,
        panel: { Component: SmokePanel },
      },
    },
  })
}

interface RegisterHost {
  __meetRegisterPlugin__?: (
    id: string,
    mod: { activate: (host: PluginHostLike) => void }
  ) => void
}

// Self-register with the host as soon as the bundle evaluates.
;(globalThis as RegisterHost).__meetRegisterPlugin__?.(PLUGIN_ID, { activate })

export { activate }
