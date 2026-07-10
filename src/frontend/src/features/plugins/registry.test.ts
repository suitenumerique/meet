import { describe, it, expect, beforeEach } from 'vitest'
import {
  __clearRegistry,
  getCaptionControllers,
  registerPlugin,
  resolveVisiblePlugins,
  getVisibleToolPlugins,
} from './registry'
import type { Plugin } from './types'
import type { ApiConfig } from '@/api/useConfig'

/** Minimal ApiConfig carrying just the hidden_tools slice for resolver tests. */
const cfg = (hidden_tools: string[]): ApiConfig =>
  ({ hidden_tools }) as unknown as ApiConfig

/** Build a minimal tool-plugin manifest for resolver tests (no rendering). */
const mk = (
  id: string,
  opts: { order?: number; enabled?: boolean; replaces?: string[] } = {}
): Plugin => ({
  id,
  apiVersion: '1.0.0',
  i18nNamespace: id.replace(/\./g, '-'),
  order: opts.order,
  isEnabled: () => opts.enabled ?? true,
  replaces: () => opts.replaces ?? [],
  contributes: { tool: { icon: null, panel: { Component: () => null } } },
})

const ids = (plugins: Plugin[]): string[] => plugins.map((p) => p.id)

/** Deterministic-output, non-deterministic-input Fisher–Yates shuffle. */
const shuffle = <T>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('resolveVisiblePlugins', () => {
  it('(a) one plugin replaces two built-ins', () => {
    const transcript = mk('recording.transcript')
    const screenRecording = mk('recording.screen-recording')
    const tool = mk('vendor.tool', {
      replaces: ['recording.transcript', 'recording.screen-recording'],
    })

    const visible = resolveVisiblePlugins([transcript, screenRecording, tool])

    expect(ids(visible)).toEqual(['vendor.tool'])
  })

  it('(b) two plugins hiding the same built-in — both survive', () => {
    const builtin = mk('recording.transcript')
    const p1 = mk('vendor.a', { replaces: ['recording.transcript'] })
    const p2 = mk('vendor.b', { replaces: ['recording.transcript'] })

    const visible = resolveVisiblePlugins([builtin, p1, p2])

    expect(ids(visible)).toEqual(['vendor.a', 'vendor.b'])
  })

  it('(c) mutual A↔B — exactly one survivor, lowest order', () => {
    const a = mk('vendor.a', { order: 0, replaces: ['vendor.b'] })
    const b = mk('vendor.b', { order: 1, replaces: ['vendor.a'] })

    const visible = resolveVisiblePlugins([a, b])

    expect(ids(visible)).toEqual(['vendor.a'])
  })

  it('(d) cycle A→B→C→A — one survivor', () => {
    const a = mk('vendor.a', { replaces: ['vendor.b'] })
    const b = mk('vendor.b', { replaces: ['vendor.c'] })
    const c = mk('vendor.c', { replaces: ['vendor.a'] })

    const visible = resolveVisiblePlugins([a, b, c])

    // Equal order → lexicographic tiebreak: a hides b, b is skipped,
    // c hides a → only c survives.
    expect(ids(visible)).toEqual(['vendor.c'])
  })

  it("(e) disabled plugin's replaces is ignored", () => {
    const builtin = mk('recording.transcript')
    const disabled = mk('vendor.tool', {
      enabled: false,
      replaces: ['recording.transcript'],
    })

    const visible = resolveVisiblePlugins([builtin, disabled])

    expect(ids(visible)).toEqual(['recording.transcript'])
  })

  it('(f) hides plugins whose id is in config.hidden_tools', () => {
    const transcript = mk('recording.transcript')
    const screenRecording = mk('recording.screen-recording')
    const acme = mk('acme.transcription')

    const visible = resolveVisiblePlugins(
      [transcript, screenRecording, acme],
      cfg(['recording.transcript'])
    )

    // Equal order → lexicographic id tiebreak: acme.* before recording.*
    expect(ids(visible)).toEqual([
      'acme.transcription',
      'recording.screen-recording',
    ])
  })

  it('(g) hidden_tools applies on top of replaces', () => {
    const transcript = mk('recording.transcript')
    const acme = mk('acme.transcription', {
      replaces: ['recording.transcript'],
    })

    // replaces already hides transcript; hidden_tools additionally hides nothing
    // visible here, leaving only acme.
    const visible = resolveVisiblePlugins(
      [transcript, acme],
      cfg(['recording.transcript'])
    )

    expect(ids(visible)).toEqual(['acme.transcription'])
  })

  it('(h) force-hiding every tool resolves to an empty menu', () => {
    const only = mk('vendor.only')

    const visible = resolveVisiblePlugins([only], cfg(['vendor.only']))

    // No never-zero guard: an admin force-hiding the last tool gets an empty menu.
    expect(ids(visible)).toEqual([])
  })

  it('is permutation-invariant (same set shuffled → identical output)', () => {
    const all = [
      mk('recording.transcript'),
      mk('recording.screen-recording'),
      mk('vendor.alpha', { order: 2, replaces: ['recording.transcript'] }),
      mk('vendor.beta', { order: 1, replaces: ['vendor.alpha'] }),
      mk('vendor.gamma', { order: 1, replaces: ['vendor.beta'] }),
    ]

    const expected = ids(resolveVisiblePlugins(all))

    for (let i = 0; i < 50; i++) {
      expect(ids(resolveVisiblePlugins(shuffle(all)))).toEqual(expected)
    }
  })
})

/** A headless caption controller stub for superset tests. */
const CC = (): null => null

/** Minimal native `Plugin` manifest (contributes a captionController). */
const mkCC = (
  id: string,
  opts: { enabled?: boolean; priority?: number; ccEnabled?: boolean } = {}
): Plugin => ({
  id,
  apiVersion: '1.0.0',
  i18nNamespace: id.replace(/\./g, '-'),
  isEnabled: () => opts.enabled ?? true,
  contributes: {
    captionController: {
      priority: opts.priority,
      Controller: CC,
      isEnabled:
        opts.ccEnabled === undefined ? undefined : () => opts.ccEnabled!,
    },
  },
})

describe('getCaptionControllers', () => {
  beforeEach(() => __clearRegistry())

  it('returns only enabled captionController contributions', () => {
    registerPlugin(mk('vendor.tool-only')) // no controller
    registerPlugin(mkCC('vendor.cc-on', { priority: 0 }))
    registerPlugin(mkCC('vendor.cc-off', { enabled: false, priority: 5 }))

    const ccs = getCaptionControllers()

    expect(ccs.map((c) => c.priority)).toEqual([0])
    expect(ccs[0].Controller).toBe(CC)
  })

  it('respects the contribution-level isEnabled gate', () => {
    registerPlugin(mkCC('vendor.cc-on', { priority: 0 }))
    registerPlugin(mkCC('vendor.cc-gated', { priority: 5, ccEnabled: false }))

    const ccs = getCaptionControllers()

    // Plugin is enabled, but the contribution gated itself off → excluded.
    expect(ccs.map((c) => c.priority)).toEqual([0])
  })

  it('excludes a hidden_tools kill-listed plugin', () => {
    registerPlugin(mkCC('vendor.cc-on', { priority: 0 }))
    registerPlugin(mkCC('vendor.cc-killed', { priority: 5 }))

    const ccs = getCaptionControllers(cfg(['vendor.cc-killed']))

    expect(ccs.map((c) => c.pluginId)).toEqual(['vendor.cc-on'])
  })
})

describe('getVisibleToolPlugins', () => {
  beforeEach(() => __clearRegistry())

  it('resolves visible tool plugins as their stored Plugin manifests', () => {
    registerPlugin(mk('recording.transcript'))
    registerPlugin(mk('vendor.tool', { replaces: ['recording.transcript'] }))
    registerPlugin(mkCC('vendor.cc-only')) // non-tool → never visible here

    const visible = getVisibleToolPlugins()

    expect(visible.map((p) => p.id)).toEqual(['vendor.tool'])
    expect(visible[0].apiVersion).toBe('1.0.0')
    expect(visible[0].contributes.tool).toBeDefined()
  })

  it('a late registerPlugin() is observable to a re-reading consumer', () => {
    // Selectors read the live registry, so a plugin registered AFTER an initial
    // read (a late external bundle) appears on the next read. In React this
    // re-read is triggered by the useRegistryVersion() bump on registration.
    registerPlugin(mk('vendor.early'))
    expect(getVisibleToolPlugins().map((p) => p.id)).toEqual(['vendor.early'])

    registerPlugin(mk('vendor.late'))
    expect(getVisibleToolPlugins().map((p) => p.id)).toEqual([
      'vendor.early',
      'vendor.late',
    ])
  })
})
