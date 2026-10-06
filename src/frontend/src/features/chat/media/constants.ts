/**
 * LiveKit byte stream topic carrying chat images. Distinct from `lk.chat`,
 * the text stream topic `useChat` drives, so an attachment cannot be forged
 * by typing a marker into the message box.
 */
export const CHAT_MEDIA_TOPIC = 'chat-media'

/** Long edge of a downscaled image, in pixels. */
export const DOWNSCALE_LONG_EDGE = 2048

/**
 * 4096 x 4096, about 64 MiB once decoded. The byte cap alone does not bound
 * memory: a 250 kB PNG can declare 16000 x 16000 and cost every receiver over
 * a gigabyte to display. The sender reduces anything larger and the receiver
 * refuses it.
 */
export const MAX_IMAGE_PIXELS = 4096 * 4096

/**
 * Bounds the shape of a row, so a declared 1 x 100000 image cannot stretch
 * the chat list past every other message. A taller or wider image is
 * letterboxed inside it.
 */
export const MAX_ASPECT_RATIO = 4

/** Encodings a reduced image may take, in order of preference. */
export const DOWNSCALE_TYPES = ['image/webp', 'image/jpeg', 'image/png']

/** Quality passed to `toBlob` when re-encoding an over-cap image. */
export const DOWNSCALE_QUALITY = 0.85

/**
 * Bytes written per chunk. LiveKit splits its own writes near this size, so
 * matching it avoids a second split.
 */
export const CHUNK_SIZE = 15_000

/** A caption longer than this is truncated before it is sent or rendered. */
export const MAX_CAPTION_LENGTH = 2000

/**
 * Inbound streams read at once from a single participant. Further streams from
 * that participant are dropped rather than queued, so one sender cannot fill
 * another participant's memory.
 */
export const MAX_CONCURRENT_STREAMS_PER_SENDER = 3

/**
 * Progress is written to the store in steps of this many percent. A 5 MB image
 * arrives in roughly 350 chunks, and writing each one would re-render the
 * virtualized list about 44 times a second.
 */
export const PROGRESS_STEP_PERCENT = 5
