// Showcase plugin — the reference example for authoring a deploy-time meet plugin.
//
// It is NOT a product feature: it does nothing useful, only generates test data.
// Its single job is to touch EVERY seam of the host ABI so plugin authors can copy
// a working call for each capability, and so the framework ships no frozen contract
// without an in-tree consumer + test.
//
// Build it as a self-registering UMD bundle with the shared external-bundle preset:
//   PLUGIN_ENTRY=plugin-examples/showcase/index.tsx PLUGIN_NAME=showcase \
//     npx vite build --config vite.plugin.config.ts
// then point the host at the emitted `dist-plugins/showcase.umd.js` via the
// `VITE_PLUGIN_BUNDLES` env (see plugin-examples/README.md). It is loaded in dev/CI
// only — never registered in the production `main.tsx`.
//
// The golden rule an author learns here: a plugin imports ONLY the shared singletons
// (react/valtio/livekit, bound to the host at runtime) and reaches everything else
// through the `host` object from `activate(host)`. Host internals are imported
// `import type` only — types are erased at build, so there is no runtime coupling.
import * as React from 'react'
import type { MeetPluginHost } from '@/features/plugins/host'
import type { Plugin } from '@/features/plugins/types'
import type { NormalizedCaption } from '@/features/subtitle/captionBus'

const PLUGIN_ID = 'example.showcase'
const NS = 'example-showcase'

// Captured from `activate(host)` and read by the panel/controller components below.
// A bundle's code-split surfaces cannot share a module-local store across the
// host↔bundle boundary, so anything cross-surface lives on `host.pluginContext`.
let host: MeetPluginHost

/** Cross-surface state shared between the panel and the headless controller. */
interface ShowcaseContext {
  captionsDemo: boolean
  /** 'append' shows captionBus.push (lines accumulate); 'replace' shows captionBus.replace (one line). */
  captionMode: 'append' | 'replace'
}
const context = (): ShowcaseContext =>
  host.pluginContext(PLUGIN_ID) as unknown as ShowcaseContext

// A rotating cast of fake speakers + phrases so the demo looks like a real
// multi-person transcription: each speaker renders as its own coloured turn
// (avatar + name) in the overlay, instead of one run-on block.
const SPEAKERS = [
  { key: 'alice', name: 'Alice', color: '#e5484d' },
  { key: 'bob', name: 'Bob', color: '#4c86ff' },
  { key: 'carol', name: 'Carol', color: '#30a46c' },
  { key: 'dave', name: 'Dave', color: '#f5a623' },
]
const PHRASES = [
  'Let me share my screen for a second.',
  'Sounds good — I agree with that approach.',
  'Can everyone see the slides okay?',
  "I'll take the action item on the API.",
  'We should follow up on this next week.',
  'Any objections before we move on?',
  'Good point, let me note that down.',
  'Sorry, you cut out — could you repeat?',
]

let captionSeq = 0
const demoCaption = (final: boolean): NormalizedCaption => {
  const speaker = SPEAKERS[captionSeq % SPEAKERS.length]
  const text = PHRASES[captionSeq % PHRASES.length]
  captionSeq += 1
  const now = Date.now()
  return {
    id: `${PLUGIN_ID}-${captionSeq}`,
    speaker,
    text,
    final,
    firstReceivedTime: now,
    lastReceivedTime: now,
    language: 'en',
  }
}

// One banner per severity tone, so the demo shows every type at once.
const BANNER_TONES = [
  { tone: 'info', icon: 'info', text: 'Info banner' },
  { tone: 'success', icon: 'check_circle', text: 'Success banner' },
  { tone: 'warning', icon: 'warning', text: 'Warning banner' },
  { tone: 'danger', icon: 'error', text: 'Danger banner' },
] as const

// ---------------------------------------------------------------------------
// Imperative ABI demos — one call per capability. Kept as plain functions of
// `host` (not buried in JSX handlers) so the panel buttons AND the unit test
// exercise the exact same seam call. Copy any of these into a real plugin.
// ---------------------------------------------------------------------------
export const demos = {
  /** banner seam: one ambient pill per tone (distinct ids, so they stack). */
  showBanners: (h: MeetPluginHost) => {
    for (const b of BANNER_TONES)
      h.banner.show(`showcase-${b.tone}`, { text: b.text, icon: b.icon, tone: b.tone })
  },
  hideBanners: (h: MeetPluginHost) => {
    for (const b of BANNER_TONES) h.banner.hide(`showcase-${b.tone}`)
  },

  /** notify seam: a generic toast. */
  toast: (h: MeetPluginHost) => h.notify('Showcase toast'),

  /** captionButton seam: decorate the CC button + a one-time popover. */
  decorate: (h: MeetPluginHost) =>
    h.captionButton.setDecoration('showcase', {
      live: true,
      badge: 'demo',
      tone: 'info',
      label: 'Showcase is decorating the CC button',
    }),
  clearDecoration: (h: MeetPluginHost) => h.captionButton.clearDecoration('showcase'),
  // `once: 'per-meeting'` + roomId would show a hint at most once per meeting;
  // omitted here so the demo button is repeatable.
  popover: (h: MeetPluginHost) =>
    h.captionButton.popover('showcase', {
      text: 'Popover anchored to the CC button — click outside to dismiss.',
    }),

  // captionBus is TOP-OWNER-GATED: push/replace only work while you HOLD a claim,
  // so these run inside the controller's held claim (below), never as one-shots
  // (a one-shot claim→push→release would blank the stream on release).
  /** captionBus.push — append one speaker's line; different speakers stack as turns. */
  pushLine: (h: MeetPluginHost, token: symbol) =>
    h.captionBus.push(token, [demoCaption(true)]),
  /** captionBus.replace — swap the whole stream for a single latest line. */
  replaceLine: (h: MeetPluginHost, token: symbol) =>
    h.captionBus.replace(token, [demoCaption(true)]),
}

// ---------------------------------------------------------------------------
// Headless caption controller: contributed via `contributes.captionController`,
// the host mounts it inside RoomContext. It owns the caption bus ONLY while the
// panel's "Demo captions" switch is on (state read from `pluginContext`), which
// demonstrates claim/release/push + cross-surface context in one place.
// ---------------------------------------------------------------------------
function ShowcaseCaptionController(): null {
  const ctx = host.valtio.useSnapshot(
    context() as unknown as object
  ) as ShowcaseContext

  React.useEffect(() => {
    if (!ctx.captionsDemo) return
    // claim() at priority 10 overrides the native source (priority 0): a takeover.
    // The claim is HELD for the whole demo — push/replace only work while on top.
    const token = host.captionBus.claim(PLUGIN_ID, { priority: 10 })
    if (!token) return
    const tick = () =>
      ctx.captionMode === 'replace'
        ? demos.replaceLine(host, token)
        : demos.pushLine(host, token)
    tick()
    const timer = setInterval(tick, 1500)
    return () => {
      clearInterval(timer)
      host.captionBus.release(token) // hand the bus back to the native source
    }
  }, [ctx.captionsDemo, ctx.captionMode])

  return null
}

// ---------------------------------------------------------------------------
// Tool panel: a sub-panel "app" contributed via `contributes.tool`. Rendered in
// the Tools menu; drives the imperative demos + reflects the read seams.
// ---------------------------------------------------------------------------
function ShowcasePanel(): React.ReactElement {
  const { Text, Button, Switch, Icon } = host.primitives

  // --- Read seams: config, plugin config slice, room/user/rights/metadata. ---
  const { data: config } = host.useConfig()
  const pluginSlice = host.usePluginConfig(PLUGIN_ID as never)
  const room = host.useRoomData()
  const user = host.useUser()
  const isAdmin = host.useIsAdminOrOwner()
  const metadata = host.useRoomMetadata()

  // --- Peer broadcast: propagate a counter to every participant, no server. ---
  const broadcast = host.useBroadcast<{ hello: number }>(PLUGIN_ID)

  // --- Cross-surface context that gates the headless caption controller. ---
  const ctx = host.valtio.useSnapshot(
    context() as unknown as object
  ) as ShowcaseContext

  // --- Data seam: an authenticated fetch, with the host's typed error. ---
  const [fetchState, setFetchState] = React.useState('idle')
  const ping = async () => {
    try {
      await host.fetchApi('config/')
      setFetchState('ok')
    } catch (error) {
      setFetchState(
        error instanceof host.ApiError ? `error ${error.statusCode}` : 'error'
      )
    }
  }

  // --- accessGate: the generic "no access" surface, shown to non-admins.
  // An author supplies their own i18n keys, image and request handler. ---
  if (!isAdmin) {
    const AccessGate = host.accessGate
    return (
      <AccessGate
        i18nKeyPrefix="example-showcase"
        i18nKey="noAccess"
        imagePath="/icon.png"
        isActive={false}
        handleRequest={async () => host.notify('Access requested')}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Text variant="h3" margin={false}>
        <Icon type="symbols" name="extension" aria-hidden /> Plugin ABI showcase
      </Text>

      <Button size="sm" onPress={() => demos.showBanners(host)}>
        Show banners (all tones)
      </Button>
      <Button size="sm" variant="tertiary" onPress={() => demos.hideBanners(host)}>
        Hide banners
      </Button>
      <Button size="sm" onPress={() => demos.toast(host)}>
        Toast (notify)
      </Button>
      <Button size="sm" onPress={() => demos.decorate(host)}>
        Decorate CC button
      </Button>
      <Button
        size="sm"
        variant="tertiary"
        onPress={() => demos.clearDecoration(host)}
      >
        Clear decoration
      </Button>
      <Button size="sm" onPress={() => demos.popover(host)}>
        CC popover
      </Button>

      {/* caption bus: a headless controller HOLDS a claim (a takeover) and, each
          tick, either pushes (append) or replaces (single line) per the mode. */}
      <Switch
        isSelected={ctx.captionsDemo}
        onChange={(on) => {
          context().captionsDemo = on
        }}
      >
        Demo captions — take over the bus + generate test lines
      </Switch>
      <Switch
        isSelected={ctx.captionMode === 'replace'}
        onChange={(on) => {
          context().captionMode = on ? 'replace' : 'append'
        }}
      >
        Replace mode (single line) instead of append
      </Switch>
      <Text variant="note">Current bus owner: {host.captionBus.current() ?? 'idle'}</Text>

      {/* broadcast seam */}
      <Button
        size="sm"
        onPress={() => broadcast.publish({ hello: Math.floor(Date.now() / 1000) })}
      >
        Broadcast to peers
      </Button>
      <Text variant="note">
        Peers broadcasting: {Object.keys(broadcast.peers).length}
      </Text>

      {/* fetchApi + ApiError seams */}
      <Button size="sm" onPress={ping}>
        Ping API (fetchApi)
      </Button>
      <Text variant="note">Fetch: {fetchState}</Text>

      {/* Read-only reflection of the data seams + analytics enum. */}
      <Text variant="note">Room: {room?.id ?? '—'}</Text>
      <Text variant="note">User: {user.user?.email ?? 'anonymous'}</Text>
      <Text variant="note">Recording: {metadata?.status ?? '—'}</Text>
      <Text variant="note">
        Config subtitle: {String(config?.subtitle?.enabled ?? false)}
      </Text>
      <Text variant="note">Plugin config slice: {JSON.stringify(pluginSlice ?? null)}</Text>
      <Text variant="note">Gated on flag: {host.analytics.FeatureFlags.Transcript}</Text>
    </div>
  )
}

/** The manifest this plugin registers — exported so a test can assert its shape. */
export const buildManifest = (): Plugin => ({
  id: PLUGIN_ID,
  apiVersion: '1.0.0',
  i18nNamespace: NS,
  order: 100,
  isEnabled: () => true,
  contributes: {
    tool: {
      icon: <host.primitives.Icon type="symbols" name="extension" />,
      titleKey: 'tool.title',
      descriptionKey: 'tool.body',
      panel: {
        Component: ShowcasePanel,
        headingKey: 'panel.heading',
        contentKey: 'panel.content',
      },
    },
    captionController: {
      priority: 10,
      Controller: ShowcaseCaptionController,
    },
  },
})

/** Entry point the host calls after the bundle self-registers. */
export function activate(pluginHost: MeetPluginHost): void {
  host = pluginHost

  // i18n seam: contribute this plugin's namespace for the languages meet ships.
  // (fallbackLng is 'fr', so registering en + fr also covers de/nl.)
  const strings: Record<string, object> = {
    en: {
      tool: {
        title: 'ABI Showcase',
        body: 'Reference plugin exercising every host capability.',
      },
      panel: { heading: 'ABI Showcase', content: 'Close the showcase panel' },
    },
    fr: {
      tool: {
        title: 'Showcase de l’ABI',
        body: 'Plugin de référence qui exerce chaque capacité de l’hôte.',
      },
      panel: { heading: 'Showcase de l’ABI', content: 'Fermer le panneau showcase' },
    },
  }
  for (const lng of Object.keys(strings)) {
    host.i18n.addResourceBundle(lng, NS, strings[lng], true, true)
  }

  // Seed the cross-surface context before either surface reads it.
  Object.assign(context(), { captionsDemo: false, captionMode: 'append' })

  host.registerPlugin(buildManifest())
}

// Self-register with the host as soon as the bundle evaluates.
;(
  globalThis as {
    __meetRegisterPlugin__?: (id: string, mod: { activate: typeof activate }) => void
  }
).__meetRegisterPlugin__?.(PLUGIN_ID, { activate })
