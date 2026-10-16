import {
  DOWNSCALE_LONG_EDGE,
  DOWNSCALE_QUALITY,
  DOWNSCALE_TYPES,
  MAX_ENCODED_EDGE,
  MAX_IMAGE_PIXELS,
} from './constants'

type Reduced = { blob: Blob; width: number; height: number }

/** Whether any pixel is less than fully opaque. */
const hasTransparency = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) => {
  const { data } = context.getImageData(0, 0, width, height)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true
  }
  return false
}

/**
 * The bitmap drawn at that size, as the first of `DOWNSCALE_TYPES` allowed and
 * encodable, or null. A browser falls back to PNG, so each type is checked.
 * JPEG is skipped for an image with transparency, which it would turn black.
 */
async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  allowedMimetypes: string[]
): Promise<Reduced | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')
    context.drawImage(bitmap, 0, 0, width, height)

    for (const type of DOWNSCALE_TYPES) {
      if (!allowedMimetypes.includes(type)) continue
      if (type === 'image/jpeg' && hasTransparency(context, width, height))
        continue
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
    // Freed now rather than at collection, before a second size is drawn.
    canvas.width = 0
  }
}

/**
 * The image redrawn smaller, or null when no allowed type is encodable. A file
 * under `maxBytes` is only over the pixel cap, so it first shrinks to fit that
 * cap; otherwise, or when that is still over `maxBytes`, the long edge goes to
 * `DOWNSCALE_LONG_EDGE`. The result may still be over `maxBytes`.
 */
export async function downscaleImage(
  file: File,
  allowedMimetypes: string[],
  maxBytes: number
): Promise<Reduced | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const longEdge = Math.max(width, height)
    const sizes: Array<[number, number]> = []
    if (file.size <= maxBytes) {
      const capScale = Math.min(
        1,
        Math.sqrt(MAX_IMAGE_PIXELS / (width * height)),
        MAX_ENCODED_EDGE / longEdge
      )
      // Rounded down, so the result never lands past the pixel cap.
      sizes.push([Math.floor(width * capScale), Math.floor(height * capScale)])
    }
    const edgeScale = Math.min(1, DOWNSCALE_LONG_EDGE / longEdge)
    sizes.push([Math.round(width * edgeScale), Math.round(height * edgeScale)])

    let reduced: Reduced | null = null
    for (const [w, h] of sizes) {
      reduced = await encode(
        bitmap,
        Math.max(1, w),
        Math.max(1, h),
        allowedMimetypes
      )
      if (!reduced || reduced.blob.size <= maxBytes) return reduced
    }
    return reduced
  } finally {
    bitmap.close()
  }
}
