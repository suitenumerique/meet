import { useCallback } from 'react'
import { ref } from 'valtio'
import { useRoomContext } from '@livekit/components-react'
import {
  appendLocalMediaRow,
  chatStore,
  clearPendingAttachment,
  clearTextAreaValue,
  stageAttachment,
} from '@/stores/chat'
import { CHAT_MEDIA_TOPIC, CHUNK_SIZE, MAX_CAPTION_LENGTH } from './constants'
import { downscaleImage } from './downscaleImage'
import { measureImage, probeImage } from './probeImage'
import { useChatMediaLimits } from './useChatMediaLimits'

/**
 * An image and its caption are one byte stream. The caption travels in the
 * stream's attributes rather than as a second chat message, so the two arrive
 * together, nothing has to pair them afterwards, and an attachment cannot be
 * forged by typing a marker into the message box.
 *
 * Written with `streamBytes` rather than `sendFile`. The convenience wrapper
 * accepts only a topic, a MIME type and destinations, dropping the three fields
 * this needs: the attributes carrying the caption, the name that replaces the
 * real filename, and the total size that lets a receiver show a percentage.
 */
export const useSendChatMedia = () => {
  const room = useRoomContext()
  const limits = useChatMediaLimits()

  /**
   * Validates, reduces if needed, and holds the result for the participant to
   * caption. Nothing is sent until they press send, so a mistaken drop can be
   * taken back.
   */
  const stage = useCallback(
    async (file: File) => {
      chatStore.isPreparing = true
      chatStore.mediaFailure = undefined
      let previewUrl: string | undefined

      try {
        const probe = await probeImage(file)
        if (!probe || !limits.allowedMimetypes.includes(probe.mimeType)) {
          chatStore.mediaFailure = 'type_not_allowed'
          return
        }

        let payload: Blob = file
        if (file.size > limits.maxSize) {
          if (probe.isAnimated) {
            // Flattening an animation to one frame is a silent surprise, and
            // the browser has no GIF encoder to reduce it with.
            chatStore.mediaFailure = 'animation_too_large'
            return
          }
          payload = await downscaleImage(file)
          if (payload.size > limits.maxSize) {
            chatStore.mediaFailure = 'too_large'
            return
          }
        }

        previewUrl = URL.createObjectURL(payload)
        const { width, height } = await measureImage(previewUrl)

        stageAttachment({
          // A Blob keeps its bytes in an internal slot a proxy cannot forward,
          // so valtio must store it as-is.
          blob: ref(payload),
          mimeType: payload.type || probe.mimeType,
          previewUrl,
          width,
          height,
        })
        previewUrl = undefined
      } catch {
        chatStore.mediaFailure = 'unreadable'
      } finally {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        chatStore.isPreparing = false
      }
    },
    [limits]
  )

  const send = useCallback(async () => {
    const pending = chatStore.pendingAttachment
    if (!pending || chatStore.isSending) return

    const caption = chatStore.textAreaValue.slice(0, MAX_CAPTION_LENGTH)
    chatStore.isSending = true

    try {
      const bytes = new Uint8Array(await pending.blob.arrayBuffer())
      const writer = await room.localParticipant.streamBytes({
        topic: CHAT_MEDIA_TOPIC,
        mimeType: pending.mimeType,
        totalSize: bytes.byteLength,
        // The real filename never leaves the sender.
        // `IMG_20260115_client-negotiation.jpg` says plenty on its own.
        name: `image.${pending.mimeType.split('/')[1] || 'bin'}`,
        attributes: {
          caption,
          width: String(pending.width),
          height: String(pending.height),
        },
      })

      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        await writer.write(bytes.subarray(offset, offset + CHUNK_SIZE))
      }
      await writer.close()

      appendLocalMediaRow({
        id: writer.info.id,
        identity: room.localParticipant.identity,
        name: room.localParticipant.name,
        caption,
        mimeType: pending.mimeType,
        size: bytes.byteLength,
        width: pending.width,
        height: pending.height,
        // The row adopts the preview rather than decoding the image again.
        // Byte streams do not echo to their sender, so without this the sender
        // alone would not see what they just sent.
        objectUrl: pending.previewUrl,
      })
      clearTextAreaValue()
    } catch {
      chatStore.mediaFailure = 'send_failed'
    } finally {
      chatStore.isSending = false
    }
  }, [room])

  return { stage, send, clear: clearPendingAttachment, limits }
}
