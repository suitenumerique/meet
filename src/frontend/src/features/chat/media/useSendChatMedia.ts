import { useCallback } from 'react'
import { ref } from 'valtio'
import { useRoomContext } from '@livekit/components-react'
import {
  appendLocalMediaRow,
  chatStore,
  clearTextAreaValue,
  stageAttachment,
} from '@/stores/chat'
import { CHAT_MEDIA_TOPIC, CHUNK_SIZE } from './constants'
import { downscaleImage } from './downscaleImage'
import {
  exceedsPixelCap,
  imageExtension,
  isAnimated,
  measureImage,
  sniffBlob,
} from './probeImage'
import { sanitizeCaption } from './sanitize'
import { useChatMediaLimits } from './useChatMediaLimits'

/**
 * An image and its caption are one byte stream, so they arrive together. It
 * uses `streamBytes`, since `sendFile` drops the attributes, name and size.
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
      // Staging mid-send would replace the attachment the send is about to
      // hand to the sender's own row, and a second staging still reducing
      // would land after this one and replace it.
      if (!limits.enabled || chatStore.isSendingMedia || chatStore.isPreparing)
        return
      chatStore.isPreparing = true
      chatStore.mediaFailure = undefined
      let previewUrl: string | undefined

      try {
        let mimeType = await sniffBlob(file)
        if (!mimeType || !limits.allowedMimetypes.includes(mimeType)) {
          chatStore.mediaFailure = 'type_not_allowed'
          return
        }

        let payload: Blob = file
        previewUrl = URL.createObjectURL(file)
        // An image over the size cap is reduced whatever its dimensions.
        let size =
          file.size > limits.maxSize
            ? undefined
            : await measureImage(previewUrl)

        // Receivers refuse an image past the pixel cap, so it is reduced here
        // like one past the size cap.
        if (!size || exceedsPixelCap(size)) {
          // Flattening an animation to one frame is a silent surprise, and
          // the browser has no encoder that keeps the frames.
          if (await isAnimated(file, mimeType)) {
            chatStore.mediaFailure = 'animation_too_large'
            return
          }
          const reduced = await downscaleImage(file, limits.allowedMimetypes)
          if (!reduced) {
            chatStore.mediaFailure = 'type_not_allowed'
            return
          }
          if (reduced.blob.size > limits.maxSize) {
            chatStore.mediaFailure = 'too_large'
            return
          }
          URL.revokeObjectURL(previewUrl)
          previewUrl = URL.createObjectURL(reduced.blob)
          payload = reduced.blob
          mimeType = reduced.blob.type
          size = { width: reduced.width, height: reduced.height }
        }

        stageAttachment({
          blob: ref(payload),
          mimeType,
          previewUrl,
          ...size,
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
    if (!pending || chatStore.isSendingMedia) return

    // Cleaned as every receiver cleans it, so the sender's row reads the same.
    const caption = sanitizeCaption(chatStore.textAreaValue)
    const { blob } = pending
    chatStore.isSendingMedia = true
    chatStore.mediaFailure = undefined

    try {
      const writer = await room.localParticipant.streamBytes({
        topic: CHAT_MEDIA_TOPIC,
        mimeType: pending.mimeType,
        totalSize: blob.size,
        // The real filename never leaves the sender.
        // `IMG_20260115_client-negotiation.jpg` says plenty on its own.
        name: `image.${imageExtension(pending.mimeType)}`,
        attributes: {
          caption,
          width: String(pending.width),
          height: String(pending.height),
        },
      })

      try {
        // Read a chunk at a time, so the whole image is never copied at once.
        for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
          const chunk = blob.slice(offset, offset + CHUNK_SIZE)
          await writer.write(new Uint8Array(await chunk.arrayBuffer()))
        }
      } catch (error) {
        // Closed short of its declared size, the stream fails on every
        // receiver and frees the slot it held there. Left open, it holds that
        // slot until this participant leaves.
        await writer.close().catch(() => {})
        throw error
      }
      await writer.close()

      appendLocalMediaRow(
        {
          id: writer.info.id,
          identity: room.localParticipant.identity,
          name: room.localParticipant.name,
          caption,
          mimeType: pending.mimeType,
          width: pending.width,
          height: pending.height,
        },
        // The row adopts the preview rather than decoding the image again.
        pending.previewUrl
      )
      clearTextAreaValue()
    } catch {
      chatStore.mediaFailure = 'send_failed'
    } finally {
      chatStore.isSendingMedia = false
    }
  }, [room])

  return { stage, send, limits }
}
