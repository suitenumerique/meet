import { MAX_IMAGE_PIXELS } from './constants'

/**
 * Identifies an image from its leading bytes rather than from what the sender
 * says it is. A declared MIME type is attacker-controlled on the receive path
 * and merely wrong on the send path, since browsers guess it from the file
 * extension.
 *
 * Covered by `probeImage.test.ts`.
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

/** Skips a run of GIF data sub-blocks, each a length byte then that many bytes. */
const skipSubBlocks = (bytes: Uint8Array, offset: number) => {
  let i = offset
  while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1
  return i + 1
}

/** The size of a GIF color table, from the packed byte that declares it. */
const colorTableSize = (packed: number) =>
  packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0

/**
 * Counts image descriptors by walking the block structure, so a `21 F9` or
 * `2C` byte inside compressed pixel data is never read as a frame.
 */
function isAnimatedGif(bytes: Uint8Array): boolean {
  let i = 13 + colorTableSize(bytes[10] ?? 0)
  let frames = 0
  while (i < bytes.length) {
    if (bytes[i] === 0x2c) {
      frames += 1
      if (frames > 1) return true
      // Descriptor, local color table, LZW code size, then the pixel data.
      i = skipSubBlocks(bytes, i + 10 + colorTableSize(bytes[i + 9] ?? 0) + 1)
    } else if (bytes[i] === 0x21) {
      i = skipSubBlocks(bytes, i + 2)
    } else {
      return false
    }
  }
  return false
}

// "acTL" and "IDAT", PNG chunk types.
const PNG_ANIMATION_CONTROL = [0x61, 0x63, 0x54, 0x4c]
const PNG_IMAGE_DATA = [0x49, 0x44, 0x41, 0x54]

/**
 * An APNG declares `acTL` before its first `IDAT`; a still PNG never does.
 * Null when the bytes end before either.
 */
function isAnimatedPng(bytes: Uint8Array): boolean | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 8
  while (i + 8 <= bytes.length) {
    if (startsWith(bytes, PNG_ANIMATION_CONTROL, i + 4)) return true
    if (startsWith(bytes, PNG_IMAGE_DATA, i + 4)) return false
    // Length, type and CRC around the chunk's data.
    i += 12 + view.getUint32(i)
  }
  return null
}

/** An animated WebP sets the animation flag of its leading `VP8X` chunk. */
const isAnimatedWebp = (bytes: Uint8Array) =>
  startsWith(bytes, [0x56, 0x50, 0x38, 0x58], 12) && (bytes[20] & 0x02) !== 0

const readBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

/** Where a PNG's first `IDAT` almost always sits, past any colour profile. */
const PNG_HEAD_BYTES = 64 * 1024

/**
 * Whether the image carries more than one frame. Reducing one through a canvas
 * keeps the first frame alone, so an animation over the cap is refused instead.
 * Reads only as much of the file as its format needs: none of a JPEG, the
 * header of a WebP, the head of a PNG.
 */
export async function isAnimated(
  blob: Blob,
  mimeType: string
): Promise<boolean> {
  if (mimeType === 'image/gif') return isAnimatedGif(await readBytes(blob))
  if (mimeType === 'image/png') {
    const head = isAnimatedPng(await readBytes(blob.slice(0, PNG_HEAD_BYTES)))
    return head ?? !!isAnimatedPng(await readBytes(blob))
  }
  if (mimeType === 'image/webp')
    return isAnimatedWebp(await readBytes(blob.slice(0, 21)))
  return false
}

/**
 * Reads only the head of the blob: `slice` hands back a view without pulling
 * the whole file into the JavaScript heap.
 */
export async function sniffBlob(blob: Blob): Promise<string | null> {
  return sniffImageType(new Uint8Array(await blob.slice(0, 12).arrayBuffer()))
}

/** The download and stream name, taken from the sniffed type. */
export const imageExtension = (mimeType: string) => mimeType.split('/')[1]

/**
 * Past `MAX_IMAGE_PIXELS` the sender reduces an image and every receiver
 * refuses it, so both sides ask this one question.
 */
export const exceedsPixelCap = ({
  width,
  height,
}: {
  width: number
  height: number
}) => width * height > MAX_IMAGE_PIXELS

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
