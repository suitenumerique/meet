/**
 * LiveKit byte stream topic carrying chat images. Distinct from `lk.chat`,
 * the text stream topic `useChat` drives, so an attachment cannot be forged
 * by typing a marker into the message box.
 */
export const CHAT_MEDIA_TOPIC = 'chat-media'

/**
 * Used until `/config/` answers, and when it cannot be reached. The backend is
 * authoritative: these mirror the defaults in `CHAT_MEDIA_*` settings.
 */
export const FALLBACK_MAX_SIZE = 5 * 1024 * 1024

export const FALLBACK_ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

/** Long edge of a downscaled image, in pixels. */
export const DOWNSCALE_LONG_EDGE = 2048

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
