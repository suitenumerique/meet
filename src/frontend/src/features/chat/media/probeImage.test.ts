import { describe, expect, it } from 'vitest'
import { isAnimated, sniffImageType } from './probeImage'

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

// One 1x1 frame: a Graphic Control Extension, an image descriptor, then pixel
// data whose bytes spell out a GCE and a descriptor, which a scan for those
// bytes would count as two more frames.
// prettier-ignore
const gifFrame = [
  0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0x02, 0x04, 0x21, 0xf9, 0x2c, 0x21, 0x00,
]

// prettier-ignore
const gif = (frames: number) =>
  new Uint8Array([
    ...ascii('GIF89a'),
    // 1x1 screen with a two-entry global color table.
    0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
    ...Array.from({ length: frames }, () => gifFrame).flat(),
    0x3b,
  ])

// prettier-ignore
const pngChunk = (type: string, length = 0) => [
  0x00, 0x00, 0x00, length, ...ascii(type),
  ...new Array(length).fill(0),
  0x00, 0x00, 0x00, 0x00,
]

// prettier-ignore
const png = (chunks: number[][]) =>
  new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunks.flat(),
  ])

// prettier-ignore
const webp = (flags: number) =>
  new Uint8Array([
    ...ascii('RIFF'), 0x00, 0x00, 0x00, 0x00, ...ascii('WEBP'),
    ...ascii('VP8X'), 0x0a, 0x00, 0x00, 0x00, flags, 0x00, 0x00, 0x00,
  ])

describe('sniffImageType', () => {
  it('names the four handled types from their leading bytes', async () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg'
    )
    expect(sniffImageType(png([]))).toBe('image/png')
    expect(sniffImageType(gif(1))).toBe('image/gif')
    expect(sniffImageType(webp(0))).toBe('image/webp')
  })

  it('refuses SVG, which carries no signature and can run script', async () => {
    expect(sniffImageType(new Uint8Array(ascii('<svg xmlns=')))).toBeNull()
  })
})

const animated = (bytes: Uint8Array, mimeType: string) =>
  isAnimated(new Blob([bytes as BlobPart]), mimeType)

describe('isAnimated', () => {
  it('reads a GIF by its frames, not by bytes inside its pixel data', async () => {
    expect(await animated(gif(1), 'image/gif')).toBe(false)
    expect(await animated(gif(2), 'image/gif')).toBe(true)
  })

  it('reads a PNG as animated only when acTL comes before IDAT', async () => {
    expect(
      await animated(
        png([pngChunk('IHDR', 13), pngChunk('IDAT', 2)]),
        'image/png'
      )
    ).toBe(false)
    expect(
      await animated(
        png([pngChunk('IHDR', 13), pngChunk('acTL', 8), pngChunk('IDAT', 2)]),
        'image/png'
      )
    ).toBe(true)
  })

  it('reads a WebP by the animation flag of its VP8X chunk', async () => {
    expect(await animated(webp(0x00), 'image/webp')).toBe(false)
    expect(await animated(webp(0x02), 'image/webp')).toBe(true)
  })
})
