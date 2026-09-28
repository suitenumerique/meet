import { useCallback } from 'react'
import { ref } from 'valtio'
import { useRoomContext } from '@livekit/components-react'
import {
  appendLocalMediaRow,
  chatStore,
  clearTextAreaValue,
  stageAttachment,
} from '@/stores/chat'
import { CHAT_MEDIA_TOPIC, CHUNK_SIZE, MAX_CAPTION_LENGTH } from './constants'
import { downscaleImage } from './downscaleImage'
import {
  imageExtension,
  isAnimatedGif,
  measureImage,
  sniffBlob,
} from './probeImage'
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
      // Staging mid-send would replace the attachment the send is about to
      // hand to the sender's own row.
      if (chatStore.isSendingMedia) return
      chatStore.isPreparing = true
      chatStore.mediaFailure = undefined
      let previewUrl: string | undefined

      try {
        const sniffed = await sniffBlob(file)
        if (!sniffed || !limits.allowedMimetypes.includes(sniffed)) {
          chatStore.mediaFailure = 'type_not_allowed'
          return
        }

        let payload: Blob = file
        let mimeType = sniffed
        let size: { width: number; height: number } | undefined
        if (file.size > limits.maxSize) {
          // Flattening an animation to one frame is a silent surprise, and
          // the browser has no GIF encoder to reduce it with.
          if (
            mimeType === 'image/gif' &&
            isAnimatedGif(new Uint8Array(await file.arrayBuffer()))
          ) {
            chatStore.mediaFailure = 'animation_too_large'
            return
          }
          const { blob, ...dimensions } = await downscaleImage(file)
          if (blob.size > limits.maxSize) {
            chatStore.mediaFailure = 'too_large'
            return
          }
          payload = blob
          // WebP where the browser can encode it, PNG where it cannot.
          mimeType = blob.type
          size = dimensions
        }

        previewUrl = URL.createObjectURL(payload)
        const { width, height } = size ?? (await measureImage(previewUrl))

        stageAttachment({
          // A Blob keeps its bytes in an internal slot a proxy cannot forward,
          // so valtio must store it as-is.
          blob: ref(payload),
          mimeType,
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
    if (!pending || chatStore.isSendingMedia) return

    const caption = chatStore.textAreaValue.slice(0, MAX_CAPTION_LENGTH)
    const { blob } = pending
    chatStore.isSendingMedia = true

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

      // Read a chunk at a time, so the whole image is never copied at once.
      for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
        const chunk = blob.slice(offset, offset + CHUNK_SIZE)
        await writer.write(new Uint8Array(await chunk.arrayBuffer()))
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
