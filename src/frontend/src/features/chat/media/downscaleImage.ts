import {
  DOWNSCALE_LONG_EDGE,
  DOWNSCALE_QUALITY,
  DOWNSCALE_TYPES,
} from './constants'

/**
 * Reduces an over-cap image by drawing it smaller and re-encoding it as the
 * first of `DOWNSCALE_TYPES` the allowlist accepts and the browser can encode.
 * Null when there is none: a browser falls back to PNG for a type it cannot
 * encode, so each result's type is checked rather than assumed.
 *
 * Only reached when the image exceeds the size or the pixel cap. Under both
 * the bytes are sent untouched, because re-encoding a screenshot that was
 * already lossless costs exactly the legibility the feature exists for.
 *
 * A side effect worth knowing: canvas copies pixels and nothing else, so the
 * result carries no metadata. That is not this function's job, and stripping
 * metadata generally is a separate change.
 */
export async function downscaleImage(
  file: File,
  allowedMimetypes: string[]
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(
      1,
      DOWNSCALE_LONG_EDGE / Math.max(bitmap.width, bitmap.height)
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')
    context.drawImage(bitmap, 0, 0, width, height)

    for (const type of DOWNSCALE_TYPES) {
      if (!allowedMimetypes.includes(type)) continue
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('canvas encoding failed')),
          type,
          DOWNSCALE_QUALITY
        )
      })
      if (blob.type === type) return { blob, width, height }
    }
    return null
  } finally {
    bitmap.close()
  }
}
