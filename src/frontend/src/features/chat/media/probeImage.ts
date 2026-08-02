/**
 * Identifies an image from its leading bytes rather than from what the sender
 * says it is. A declared MIME type is attacker-controlled on the receive path
 * and merely wrong on the send path, since browsers guess it from the file
 * extension.
 *
 * Pure functions over a `Uint8Array`, so a test runner covers them the day this
 * repository has one.
 */

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte)

/**
 * Returns the MIME type the bytes actually are, or null when they are not an
 * image this application handles. Never returns `image/svg+xml`: SVG is text,
 * has no magic number, and executes script once rendered.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  // FF D8 FF, the JPEG start-of-image marker followed by any APP marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'

  // The 8-byte PNG signature, whose 0x0d0a...0a catches newline mangling.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png'

  // "GIF87a" or "GIF89a".
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'

  // "RIFF" .... "WEBP": a container tag and a form type four bytes apart.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return 'image/webp'

  return null
}

/**
 * Whether a GIF carries more than one frame.
 *
 * Counts Graphic Control Extension blocks, `21 F9`, which precede each rendered
 * frame. A heuristic rather than a parse: it can misread that byte pair inside
 * compressed image data. Both failure directions are mild. A false positive
 * refuses an over-cap GIF that could have been flattened, and a false negative
 * flattens an animation the sender expected to keep, which only reaches a user
 * for a GIF above the size cap.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  let seen = 0
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
      seen += 1
      if (seen > 1) return true
    }
  }
  return false
}

export type ImageProbe = {
  mimeType: string
  isAnimated: boolean
}

/**
 * Reads only the head of the blob. `slice` hands back a view without pulling
 * the whole file into the JavaScript heap, which matters for the animation scan
 * on a large GIF.
 */
export async function probeImage(blob: Blob): Promise<ImageProbe | null> {
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer())
  const mimeType = sniffImageType(head)
  if (!mimeType) return null

  if (mimeType !== 'image/gif') return { mimeType, isAnimated: false }

  const whole = new Uint8Array(await blob.arrayBuffer())
  return { mimeType, isAnimated: isAnimatedGif(whole) }
}

/**
 * Natural dimensions, via the browser's own decoder. Doubles as the check that
 * the bytes are a renderable image and not merely something wearing an image's
 * first four bytes.
 */
export function measureImage(
  objectUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('image failed to decode'))
    image.src = objectUrl
  })
}
