# Meet plugins — authoring guide

A plugin extends a running meeting (a tool sub-panel, a live-caption source, a
banner, a CC-button decoration…) without forking the app. This folder holds the
reference examples the framework is built against.

- **`smoke/`** — the minimal "hello world": a single tool panel. The CI gate builds
  it to prove the external-bundle preset stays loadable and its externals bind to
  the host singletons.
- **`showcase/`** — the exhaustive reference: one plugin that exercises **every**
  seam of the host ABI. It does nothing useful (it only generates test data); copy
  the call you need. Unit-tested in `showcase/index.test.ts`.

## The two ways a plugin loads

1. **Built-in** — bundled with the app and registered in `src/main.tsx` via
   `registerPlugin(manifest)`. This is how the shipped `record`/`transcribe` tools
   are expressed (`src/features/recording/*.plugin.tsx`).
2. **Deploy-time external bundle** — a self-contained UMD/IIFE served at a URL and
   listed in the `VITE_PLUGIN_BUNDLES` env. No rebuild of the app to add one. This
   is the path the examples here demonstrate.

## Anatomy of an external bundle

A bundle is a module that self-registers on eval and exposes `activate(host)`:

```ts
import type { MeetPluginHost } from '@/features/plugins/host'
import type { Plugin } from '@/features/plugins/types'

export function activate(host: MeetPluginHost): void {
  host.i18n.addResourceBundle('en', 'acme-notes', { tool: { title: 'Notes' } }, true, true)
  const manifest: Plugin = {
    id: 'acme.notes',              // stable reverse-DNS id
    apiVersion: '1.0.0',           // caret-matched against the host's HOST_API_VERSION
    i18nNamespace: 'acme-notes',
    isEnabled: () => true,         // runtime gate read from GET config/
    contributes: { tool: { icon: /* … */, panel: { Component: NotesPanel } } },
  }
  host.registerPlugin(manifest)
}

// Self-register as soon as the bundle evaluates.
;(globalThis as { __meetRegisterPlugin__?: (id: string, mod: { activate: typeof activate }) => void })
  .__meetRegisterPlugin__?.('acme.notes', { activate })
```

Two golden rules:

- **Reach everything through `host`.** The object passed to `activate(host)` is the
  whole contract (see `src/features/plugins/host.ts#MeetPluginHost`): caption bus,
  banner, notify, captionButton, broadcast, primitives, the data hooks
  (`useConfig`/`useRoomData`/`useUser`/…), `fetchApi`, `pluginContext`, and more.
- **Import host internals as types only.** `import type { … }` is erased at build,
  so there is no runtime coupling. The only runtime imports are the shared
  singletons (`react`, `valtio`, `livekit-client`), which the preset marks
  `external` and binds to the host's copies — so a plugin's `react` IS the host's
  React (identity-stable hooks/proxies).

## Building a bundle

The shared preset `vite.plugin.config.ts` builds any entry into a self-registering
UMD, its singletons externalized:

```sh
# the showcase (also: npm run build:plugin-showcase)
PLUGIN_ENTRY=plugin-examples/showcase/index.tsx PLUGIN_NAME=showcase \
  npm run build:plugin
# -> dist-plugins/showcase.umd.js
```

## Wiring it into a deployment

Point the frontend at one or more built bundles via `VITE_PLUGIN_BUNDLES`, a JSON
array of refs (`{ id, url, apiVersion, peers? }`):

```sh
VITE_PLUGIN_BUNDLES='[{"id":"example.showcase","url":"/plugins/showcase.umd.js","apiVersion":"1.0.0"}]'
```

A plugin is a **static file mounted into the stock frontend image** — the image is
never rebuilt to add one. The production frontend image injects `VITE_*` env into a
runtime `config.js` at container startup, so:

```yaml
services:
  frontend:
    image: meet-frontend:latest          # stock image, unmodified
    environment:
      VITE_PLUGIN_BUNDLES: '[{"id":"acme.notes","url":"/plugins/notes.umd.js","apiVersion":"1.0.0"}]'
    volumes:
      - ./my-plugins:/usr/share/nginx/html/plugins:ro   # your built .umd.js file(s)
```

The bundle is served at `/plugins/notes.umd.js` and loaded at boot. Adding, updating
or removing a plugin is a volume + env change — no application rebuild.

Each ref is loaded independently and gated: an incompatible `apiVersion`, a
mismatched `peers` major, a slow, or a throwing bundle is skipped without taking the
app down. Related knobs:

- **`FRONTEND_HIDDEN_TOOLS`** — kill-list of tool-plugin ids the frontend must hide.

The showcase is meant to be loaded in **dev/CI only** (it produces test data); never
add it to the production `main.tsx`.
