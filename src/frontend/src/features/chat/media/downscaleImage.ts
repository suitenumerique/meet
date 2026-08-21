import { DOWNSCALE_LONG_EDGE, DOWNSCALE_QUALITY } from './constants'

/**
 * Reduces an over-cap image by drawing it smaller and re-encoding as WebP.
 *
 * Only reached when the image exceeds the size cap. Under it the bytes are sent
 * untouched, because re-encoding a screenshot that was already lossless costs
 * exactly the legibility the feature exists for.
 *
 * A side effect worth knowing: canvas copies pixels and nothing else, so the
 * result carries no metadata. That is not this function's job, and stripping
 * metadata generally is a separate change.
 */
export async function downscaleImage(file: File): Promise<Blob> {
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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('canvas encoding failed')),
        'image/webp',
        DOWNSCALE_QUALITY
      )
    })
  } finally {
    bitmap.close()
  }
}
