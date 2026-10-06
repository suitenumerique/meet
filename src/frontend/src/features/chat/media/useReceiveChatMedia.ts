import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import type { ByteStreamReader } from 'livekit-client'
import {
  appendReceivingMediaRow,
  failMediaRow,
  resolveMediaRow,
  updateMediaProgress,
} from '@/stores/chat'
import {
  CHAT_MEDIA_TOPIC,
  MAX_CONCURRENT_STREAMS_PER_SENDER,
  PROGRESS_STEP_PERCENT,
} from './constants'
import { exceedsPixelCap, measureImage, sniffBlob } from './probeImage'
import { sanitizeCaption, sanitizeDimension } from './sanitize'
import { useChatMediaLimits } from './useChatMediaLimits'

/**
 * LiveKit queues every chunk of a stream until its trailer whether anyone reads
 * it or not, and gives a handler no way to refuse one, so a declined stream is
 * read and dropped.
 */
const discard = async (reader: ByteStreamReader) => {
  try {
    const chunks = reader[Symbol.asyncIterator]()
    while (!(await chunks.next()).done);
  } catch {
    // Past its declared size the reader throws on every chunk, so the rest is
    // read from the queue it wraps. That queue is not public API: should an
    // upgrade rename it, failing loudly beats silently buffering again.
    const queue = (reader as unknown as { reader?: unknown }).reader
    if (!(queue instanceof ReadableStream)) {
      throw new TypeError('livekit-client no longer exposes the stream queue')
    }
    try {
      const chunks = queue.getReader()
      while (!(await chunks.read()).done);
    } catch {
      // Already failed or closed: nothing left to drop.
    }
  }
}

/**
 * Receives images sent on the chat media topic.
 *
 * Everything the sender declares is treated as hostile, because a room admits
 * unauthenticated participants: a stream must declare a size within the cap
 * before it is read, the read fails once the bytes pass that size, the
 * declared MIME type is ignored in favour of the payload's own leading bytes,
 * and the result must decode as an image within the pixel cap before it is
 * shown.
 */
export const useReceiveChatMedia = () => {
  const room = useRoomContext()
  const limits = useChatMediaLimits()

  useEffect(() => {
    if (!limits.enabled) return

    const inFlight = new Map<string, number>()

    room.registerByteStreamHandler(CHAT_MEDIA_TOPIC, async (reader, from) => {
      const identity = from?.identity
      const key = identity ?? 'unknown'
      const { id, size, attributes } = reader.info
      const running = inFlight.get(key) ?? 0

      // LiveKit fails a read that passes the declared size, and skips that
      // check when no size or a zero size is declared.
      const accepted =
        running < MAX_CONCURRENT_STREAMS_PER_SENDER &&
        !!size &&
        size <= limits.maxSize &&
        appendReceivingMediaRow({
          id,
          identity,
          // The handler is only told the identity, so the display name is
          // looked up on the room.
          name: identity
            ? room.getParticipantByIdentity(identity)?.name
            : undefined,
          caption: sanitizeCaption(attributes?.caption),
          mimeType: '',
          width: sanitizeDimension(attributes?.width),
          height: sanitizeDimension(attributes?.height),
        })
      if (!accepted) {
        void discard(reader)
        return
      }
      inFlight.set(key, running + 1)

      try {
        // See PROGRESS_STEP_PERCENT.
        let lastShown = -1
        reader.onProgress = (progress) => {
          if (progress == null) return updateMediaProgress(id, undefined)
          const shown =
            Math.floor((progress * 100) / PROGRESS_STEP_PERCENT) *
            PROGRESS_STEP_PERCENT
          if (shown === lastShown) return
          lastShown = shown
          updateMediaProgress(id, shown / 100)
        }

        const payload = new Blob((await reader.readAll()) as BlobPart[])
        const mimeType = await sniffBlob(payload)
        if (!mimeType || !limits.allowedMimetypes.includes(mimeType)) {
          failMediaRow(id, 'decode_failed')
          return
        }

        const objectUrl = URL.createObjectURL(
          new Blob([payload], { type: mimeType })
        )
        // Loading reads the header alone; showing it decodes every pixel.
        const measured = await measureImage(objectUrl).catch(() => undefined)
        if (!measured || exceedsPixelCap(measured)) {
          URL.revokeObjectURL(objectUrl)
          failMediaRow(id, 'decode_failed')
          return
        }

        resolveMediaRow(id, objectUrl, mimeType, measured)
      } catch {
        void discard(reader)
        failMediaRow(id, 'transfer_failed')
      } finally {
        inFlight.set(key, (inFlight.get(key) ?? 1) - 1)
      }
    })

    // Registering twice on one topic throws, and StrictMode runs this twice.
    return () => room.unregisterByteStreamHandler(CHAT_MEDIA_TOPIC)
  }, [room, limits])
}
