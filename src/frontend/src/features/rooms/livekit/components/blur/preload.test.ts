import { beforeEach, describe, expect, it, vi } from 'vitest'

const MODEL = '/assets/mediapipe/models/selfie_segmenter_landscape.tflite'
const WASM_LOADER = '/wasm/vision_wasm_internal.js'
const WASM_BINARY = '/wasm/vision_wasm_internal.wasm'

const isSupported = vi.fn(() => true)

vi.mock('.', () => ({
  BackgroundProcessorFactory: { isSupported: () => isSupported() },
  MEDIAPIPE_PATH_WASM: '/wasm',
  SELFIE_SEGMENTER_MODEL_PATH: MODEL,
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: async () => ({
      wasmLoaderPath: WASM_LOADER,
      wasmBinaryPath: WASM_BINARY,
    }),
  },
}))

vi.mock('@/features/files/utils/resolveMediaUrl', () => ({
  resolveMediaUrlOrFallback: async (url: string) => `resolved:${url}`,
}))

class FakeImage {
  static instances: FakeImage[] = []
  src = ''
  crossOrigin: string | null = null
  onerror: (() => void) | null = null
  constructor() {
    FakeImage.instances.push(this)
  }
}

const fetchMock = vi.fn()
const fetchedUrls = () => fetchMock.mock.calls.map(([url]) => url)
const imageUrls = () => FakeImage.instances.map((image) => image.src)

// Let the fire-and-forget preloads settle.
const flush = () => new Promise((resolve) => setTimeout(resolve))

const load = () => import('./preload')

beforeEach(() => {
  vi.resetModules()
  isSupported.mockReturnValue(true)
  FakeImage.instances = []
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => ({ ok: true, body: null }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('navigator', {})
})

describe('preloadEffectsAssets', () => {
  it('preloads the thumbnails, the model and the wasm', async () => {
    const { preloadEffectsAssets } = await load()
    preloadEffectsAssets()
    await flush()

    expect(imageUrls()).toHaveLength(8)
    expect(imageUrls()[0]).toBe('/assets/backgrounds/thumbnails/1.jpg')
    expect(fetchedUrls().sort()).toEqual([MODEL, WASM_LOADER, WASM_BINARY])
    expect(fetchMock).toHaveBeenCalledWith(WASM_BINARY, { priority: 'low' })
  })

  it('preloads only once', async () => {
    const { preloadEffectsAssets } = await load()
    preloadEffectsAssets()
    await flush()
    preloadEffectsAssets()
    await flush()

    expect(imageUrls()).toHaveLength(8)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('skips the wasm when the caller reports a degraded connection', async () => {
    const { preloadEffectsAssets } = await load()
    preloadEffectsAssets({ isConstrained: true })
    await flush()

    expect(imageUrls()).toHaveLength(8)
    expect(fetchedUrls()).toEqual([MODEL])
  })

  it.each([{ saveData: true }, { effectiveType: '3g' }])(
    'skips the wasm when the browser reports %o',
    async (connection) => {
      vi.stubGlobal('navigator', { connection })
      const { preloadEffectsAssets } = await load()
      preloadEffectsAssets()
      await flush()

      expect(fetchedUrls()).toEqual([MODEL])
    }
  )

  it('retries after a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockImplementation(async () => ({ ok: false, status: 503 }))
    const { preloadEffectsAssets } = await load()
    preloadEffectsAssets({ isConstrained: true })
    await flush()
    preloadEffectsAssets({ isConstrained: true })
    await flush()

    expect(fetchedUrls()).toEqual([MODEL, MODEL])
  })

  it('does nothing when background processors are not supported', async () => {
    isSupported.mockReturnValue(false)
    const { preloadEffectsAssets } = await load()
    preloadEffectsAssets()
    await flush()

    expect(imageUrls()).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('preloadBackgroundImage', () => {
  it('loads the resolved image once, in CORS mode', async () => {
    const { preloadBackgroundImage } = await load()
    await preloadBackgroundImage('/assets/backgrounds/1.jpg')
    await preloadBackgroundImage('/assets/backgrounds/1.jpg')

    expect(FakeImage.instances).toHaveLength(1)
    expect(FakeImage.instances[0].src).toBe(
      'resolved:/assets/backgrounds/1.jpg'
    )
    expect(FakeImage.instances[0].crossOrigin).toBe('anonymous')
  })

  it('skips local files and degraded connections', async () => {
    const { preloadBackgroundImage } = await load()
    await preloadBackgroundImage('blob:https://meet.example.com/1234')
    await preloadBackgroundImage('/assets/backgrounds/1.jpg', {
      isConstrained: true,
    })

    expect(FakeImage.instances).toHaveLength(0)
  })
})
