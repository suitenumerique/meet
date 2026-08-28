import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  appendReceivingMediaRow,
  failMediaRow,
  resolveMediaRow,
  updateMediaProgress,
} from '@/stores/chat'
import {
  CHAT_MEDIA_TOPIC,
  MAX_CAPTION_LENGTH,
  MAX_CONCURRENT_STREAMS_PER_SENDER,
  PROGRESS_STEP_PERCENT,
} from './constants'
import { sniffImageType } from './probeImage'
import { useChatMediaLimits } from './useChatMediaLimits'

/**
 * Control characters would let a sender break the row's layout. Matching them
 * is the point here, so the rule that normally catches them by accident is
 * suppressed deliberately.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g

const sanitizeCaption = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(CONTROL_CHARACTERS, '').slice(0, MAX_CAPTION_LENGTH)
    : ''

const sanitizeDimension = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const decodes = (objectUrl: string) =>
  new Promise<boolean>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = objectUrl
  })

/**
 * Receives images sent on the chat media topic.
 *
 * Everything the sender declares is treated as hostile, because a room admits
 * unauthenticated participants: the declared size is checked before the stream
 * is read and the assembled length again after it, the declared MIME type is
 * ignored in favour of the payload's own leading bytes, and the result must
 * decode as an image before it is shown.
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
      const running = inFlight.get(key) ?? 0
      if (running >= MAX_CONCURRENT_STREAMS_PER_SENDER) return
      inFlight.set(key, running + 1)

      const { id, size, attributes } = reader.info
      try {
        if (typeof size === 'number' && size > limits.maxSize) return

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
          size: size ?? 0,
          width: sanitizeDimension(attributes?.width),
          height: sanitizeDimension(attributes?.height),
        })

        // A 5 MB image arrives in roughly 350 chunks. Writing each one would
        // re-render the virtualized list about 44 times a second, so the store
        // only sees a change when the displayed percentage does.
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

        const chunks = await reader.readAll()
        const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
        if (total > limits.maxSize) {
          failMediaRow(id, 'transfer_failed')
          return
        }

        const payload = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          payload.set(chunk, offset)
          offset += chunk.byteLength
        }

        const mimeType = sniffImageType(payload)
        if (!mimeType || !limits.allowedMimetypes.includes(mimeType)) {
          failMediaRow(id, 'decode_failed')
          return
        }

        const objectUrl = URL.createObjectURL(
          new Blob([payload as BlobPart], { type: mimeType })
        )
        if (!(await decodes(objectUrl))) {
          URL.revokeObjectURL(objectUrl)
          failMediaRow(id, 'decode_failed')
          return
        }

        resolveMediaRow(id, objectUrl, mimeType)
      } catch {
        failMediaRow(id, 'transfer_failed')
      } finally {
        inFlight.set(key, (inFlight.get(key) ?? 1) - 1)
      }
    })

    // Registering twice on one topic throws, and StrictMode runs this twice.
    return () => room.unregisterByteStreamHandler(CHAT_MEDIA_TOPIC)
  }, [room, limits])
}
