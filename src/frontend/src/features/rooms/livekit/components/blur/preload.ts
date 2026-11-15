import { FilesetResolver } from '@mediapipe/tasks-vision'
import { resolveMediaUrlOrFallback } from '@/features/files/utils/resolveMediaUrl'
import {
  BackgroundProcessorFactory,
  MEDIAPIPE_PATH_WASM,
  SELFIE_SEGMENTER_MODEL_PATH,
} from '.'

/**
 * Warm the browser caches with what a background effect needs, ahead of
 * the click that applies it. Nothing is instantiated here: the processors
 * issue the very same requests later and find them in the HTTP cache.
 *
 * A meeting may be running, so what is preloaded is arbitrated by cost:
 *
 * | Asset                   | Size      | Preloaded                         |
 * | ----------------------- | --------- | --------------------------------- |
 * | Preset thumbnails       | ~170KB    | always                            |
 * | Segmentation model      | ~250KB    | always                            |
 * | MediaPipe wasm + loader | ~9.6MB    | low priority, unless constrained  |
 * | One background image    | ~1-1.3MB  | on thumbnail hover, unless const. |
 * | All background images   | ~9MB      | never                             |
 */

export const PRESET_BACKGROUNDS_COUNT = 8

export const getPresetBackgroundPaths = (index: number) => ({
  imagePath: `/assets/backgrounds/${index + 1}.jpg`,
  thumbnailPath: `/assets/backgrounds/thumbnails/${index + 1}.jpg`,
})

type NetworkInformation = {
  saveData?: boolean
  effectiveType?: string
}

/**
 * Data saver or a slow link, as reported by the browser (Chromium only,
 * other browsers are considered unconstrained).
 */
const isNetworkConstrained = () => {
  const connection = (navigator as { connection?: NetworkInformation })
    .connection
  if (!connection) return false
  return (
    connection.saveData === true ||
    ['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '')
  )
}

/**
 * Download a same-origin asset into the HTTP cache. The body is read to
 * completion, as an aborted response is not stored, and discarded chunk
 * by chunk to avoid buffering several megabytes.
 */
const warmHttpCache = async (url: string, priority: RequestPriority) => {
  const response = await fetch(url, { priority })
  if (!response.ok) {
    throw new Error(`Failed to preload ${url}: HTTP ${response.status}`)
  }
  const reader = response.body?.getReader()
  if (!reader) return
  while (!(await reader.read()).done) {
    // discard
  }
}

// Held so that in-flight and decoded images are not garbage collected,
// and can be reused from the memory cache. Bounded by the presets and
// the user's custom backgrounds.
const preloadedImages = new Map<string, HTMLImageElement>()

const preloadImage = (src: string, key = src, crossOrigin?: 'anonymous') => {
  if (preloadedImages.has(key)) return
  const image = new Image()
  if (crossOrigin) image.crossOrigin = crossOrigin
  image.onerror = () => preloadedImages.delete(key)
  image.src = src
  preloadedImages.set(key, image)
}

// Run each step once, and allow another attempt after a failure.
const once = (run: () => Promise<unknown>) => {
  let pending: Promise<void> | undefined
  return () => {
    pending ??= run().then(
      () => undefined,
      (error) => {
        console.warn(error)
        pending = undefined
      }
    )
    return pending
  }
}

const preloadModel = once(() =>
  warmHttpCache(SELFIE_SEGMENTER_MODEL_PATH, 'auto')
)

const preloadWasm = once(async () => {
  // Resolves to the SIMD or non-SIMD build, as the processors will.
  const { wasmLoaderPath, wasmBinaryPath } =
    await FilesetResolver.forVisionTasks(MEDIAPIPE_PATH_WASM)
  await Promise.all([
    warmHttpCache(wasmLoaderPath, 'low'),
    warmHttpCache(wasmBinaryPath, 'low'),
  ])
})

/**
 * Preload what any background effect needs. Meant to be called when the
 * user shows an intent to open the effects (hover or focus of an entry
 * point).
 *
 * @param isConstrained caller's knowledge of a degraded connection (e.g.
 * LiveKit connection quality): only the light assets are then preloaded.
 */
export const preloadEffectsAssets = ({ isConstrained = false } = {}) => {
  if (!BackgroundProcessorFactory.isSupported()) return

  for (let index = 0; index < PRESET_BACKGROUNDS_COUNT; index++) {
    preloadImage(getPresetBackgroundPaths(index).thumbnailPath)
  }
  void preloadModel()

  if (isConstrained || isNetworkConstrained()) return
  void preloadWasm()
}

/**
 * Preload a single full-size background. Meant to be called when the
 * user dwells on its thumbnail.
 */
export const preloadBackgroundImage = async (
  imagePath: string,
  { isConstrained = false } = {}
) => {
  // Local files (not logged-in users) are already in memory.
  if (imagePath.startsWith('blob:')) return
  if (isConstrained || isNetworkConstrained()) return
  if (preloadedImages.has(imagePath)) return

  // Same resolution and CORS mode as the processors' own image load, so
  // that the cached response can be reused.
  const src = await resolveMediaUrlOrFallback(imagePath)
  preloadImage(src, imagePath, 'anonymous')
}
