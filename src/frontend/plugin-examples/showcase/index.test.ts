import { describe, it, expect, vi } from 'vitest'
import type { MeetPluginHost } from '@/features/plugins/host'
import { demos, activate, buildManifest } from './index'

// A minimal spy host: enough of the ABI for the imperative demos + activate().
const token = Symbol('showcase-token')
function mockHost() {
  const captionBus = {
    claim: vi.fn(() => token),
    release: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    current: vi.fn(() => null),
  }
  const banner = { show: vi.fn(), hide: vi.fn() }
  const captionButton = {
    setDecoration: vi.fn(),
    clearDecoration: vi.fn(),
    popover: vi.fn(),
  }
  const ctxStore: Record<string, unknown> = {}
  const host = {
    apiVersion: '1.0.0',
    registerPlugin: vi.fn(),
    captionBus,
    banner,
    captionButton,
    notify: vi.fn(),
    i18n: { addResourceBundle: vi.fn() },
    pluginContext: vi.fn(() => ctxStore),
    primitives: { Icon: () => null },
  } as unknown as MeetPluginHost
  return { host, captionBus, banner, captionButton, ctxStore }
}

describe('showcase demos exercise each imperative seam', () => {
  it('banner.show / banner.hide for every tone', () => {
    const { host, banner } = mockHost()
    demos.showBanners(host)
    demos.hideBanners(host)
    expect(banner.show).toHaveBeenCalledTimes(4)
    expect(banner.show).toHaveBeenCalledWith(
      'showcase-danger',
      expect.objectContaining({ tone: 'danger' })
    )
    expect(banner.hide).toHaveBeenCalledTimes(4)
  })

  it('notify', () => {
    const { host } = mockHost()
    demos.toast(host)
    expect(host.notify).toHaveBeenCalledWith(expect.any(String))
  })

  it('captionButton decoration + popover', () => {
    const { host, captionButton } = mockHost()
    demos.decorate(host)
    demos.clearDecoration(host)
    demos.popover(host)
    expect(captionButton.setDecoration).toHaveBeenCalledWith('showcase', expect.objectContaining({ live: true }))
    expect(captionButton.clearDecoration).toHaveBeenCalledWith('showcase')
    expect(captionButton.popover).toHaveBeenCalledWith('showcase', expect.objectContaining({ text: expect.any(String) }))
  })

  it('pushLine appends via captionBus.push on a held token', () => {
    const { host, captionBus } = mockHost()
    demos.pushLine(host, token)
    expect(captionBus.push).toHaveBeenCalledWith(
      token,
      expect.arrayContaining([expect.objectContaining({ text: expect.any(String) })])
    )
  })

  it('replaceLine swaps via captionBus.replace on a held token', () => {
    const { host, captionBus } = mockHost()
    demos.replaceLine(host, token)
    expect(captionBus.replace).toHaveBeenCalledWith(token, expect.any(Array))
  })
})

describe('showcase activate() wires the registry/i18n/context seams', () => {
  it('registers a manifest with both contributions + seeds context + i18n', () => {
    const { host, ctxStore } = mockHost()
    activate(host)

    expect(host.i18n.addResourceBundle).toHaveBeenCalledWith(
      'en',
      'example-showcase',
      expect.any(Object),
      true,
      true
    )
    expect(ctxStore).toEqual({ captionsDemo: false, captionMode: 'append' })

    const registerPlugin = host.registerPlugin as ReturnType<typeof vi.fn>
    expect(registerPlugin).toHaveBeenCalledTimes(1)
    const manifest = registerPlugin.mock.calls[0][0]
    expect(manifest.id).toBe('example.showcase')
    expect(manifest.apiVersion).toBe('1.0.0')
    expect(manifest.contributes.tool?.panel.Component).toBeTypeOf('function')
    expect(manifest.contributes.captionController?.Controller).toBeTypeOf('function')
  })

  it('buildManifest is stable and enabled by default', () => {
    const { host } = mockHost()
    activate(host) // sets the module host used by buildManifest's JSX icon
    const manifest = buildManifest()
    expect(manifest.isEnabled()).toBe(true)
    expect(manifest.order).toBe(100)
  })
})
