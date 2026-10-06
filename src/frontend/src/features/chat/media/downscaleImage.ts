import {
  DOWNSCALE_LONG_EDGE,
  DOWNSCALE_QUALITY,
  DOWNSCALE_TYPES,
} from './constants'

/**
 * The image redrawn smaller, as the first of `DOWNSCALE_TYPES` allowed and
 * encodable, or null. A browser falls back to PNG, so each type is checked.
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
