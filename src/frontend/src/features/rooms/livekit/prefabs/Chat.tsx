import type { ChatMessage, ChatOptions } from '@livekit/components-core'
import React from 'react'
import {
  formatChatMessageLinks,
  useChat,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { chatStore } from '@/stores/chat'
import { Div, Text } from '@/primitives'
import { requestChatFileUploadUrl } from '../../api/requestChatFileUploadUrl'
import { ChatInput } from '../components/chat/Input'
import { ChatEntry } from '../components/chat/Entry'
import { useSidePanel } from '../hooks/useSidePanel'
import { useRoomData } from '../hooks/useRoomData'
import { LocalParticipant, RemoteParticipant, RoomEvent } from 'livekit-client'
import { css } from '@/styled-system/css'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { createAttachmentMessage } from '../components/chat/attachments'

export interface ChatProps
  extends React.HTMLAttributes<HTMLDivElement>,
    ChatOptions {}

/**
 * The Chat component adds a basis chat functionality to the LiveKit room. The messages are distributed to all participants
 * in the room. Only users who are in the room at the time of dispatch will receive the message.
 */
export function Chat({ ...props }: ChatProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat' })

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const ulRef = React.useRef<HTMLUListElement>(null)

  const room = useRoomContext()
  const roomData = useRoomData()
  const { send, chatMessages, isSending } = useChat()

  const { isChatOpen } = useSidePanel()
  const chatSnap = useSnapshot(chatStore)

  // Keep track of the element that opened the chat so we can restore focus
  // when the chat panel is closed.
  useRestoreFocus(isChatOpen, {
    // Avoid layout "jump" during the side panel slide-in animation.
    // Focusing can trigger scroll into view; preventScroll keeps the animation smooth.
    onOpened: () => {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true })
      })
    },
    preventScroll: true,
  })

  // Use useParticipants hook to trigger a re-render when the participant list changes.
  const participants = useParticipants()

  const lastReadMsgAt = React.useRef<ChatMessage['timestamp']>(0)
  const previousMessageCount = React.useRef(0)

  async function handleSubmit(text: string) {
    if (!send || !text) return
    await send(text)
    inputRef?.current?.focus({ preventScroll: true })
  }

  async function handleUploadFiles(files: FileList | File[]) {
    if (!send || !roomData?.id || !roomData.livekit?.token) {
      throw new Error('Room metadata is unavailable for file uploads.')
    }

    const uploadQueue = Array.from(files)

    for (const file of uploadQueue) {
      const uploadMetadata = await requestChatFileUploadUrl({
        roomId: roomData.id,
        token: roomData.livekit.token,
        filename: file.name,
        contentType: file.type,
      })

      const uploadResponse = await fetch(uploadMetadata.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': uploadMetadata.content_type,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed for ${file.name}`)
      }

      await send(
        createAttachmentMessage({
          filename: uploadMetadata.filename,
          size: file.size,
          contentType: uploadMetadata.content_type,
          downloadUrl: uploadMetadata.download_url,
        })
      )
    }
  }

  // TEMPORARY: This is a brittle workaround that relies on message count tracking
  // due to recent LiveKit useChat changes breaking the previous implementation
  // (see https://github.com/livekit/components-js/issues/1158)
  // Remove this once we refactor chat to use the new text stream approach
  React.useEffect(() => {
    if (!chatMessages || chatMessages.length <= previousMessageCount.current)
      return
    const msg = chatMessages.slice(-1)[0]
    const from = msg.from as RemoteParticipant | LocalParticipant | undefined
    room.emit(RoomEvent.ChatMessage, msg, from)
    previousMessageCount.current = chatMessages.length
  }, [chatMessages, room])

  React.useEffect(() => {
    if (chatMessages.length > 0 && ulRef.current) {
      ulRef.current?.scrollTo({ top: ulRef.current.scrollHeight })
    }
  }, [ulRef, chatMessages])

  React.useEffect(() => {
    if (chatMessages.length === 0) {
      return
    }
    if (
      isChatOpen &&
      lastReadMsgAt.current !== chatMessages[chatMessages.length - 1]?.timestamp
    ) {
      lastReadMsgAt.current = chatMessages[chatMessages.length - 1]?.timestamp
      chatStore.unreadMessages = 0
      return
    }

    const unreadMessageCount = chatMessages.filter(
      (msg) => !lastReadMsgAt.current || msg.timestamp > lastReadMsgAt.current
    ).length

    if (
      unreadMessageCount > 0 &&
      chatSnap.unreadMessages !== unreadMessageCount
    ) {
      chatStore.unreadMessages = unreadMessageCount
    }
  }, [chatMessages, chatSnap.unreadMessages, isChatOpen])

  const renderedMessages = React.useMemo(() => {
    return chatMessages.map((msg, idx, allMsg) => {
      const hideMetadata =
        idx >= 1 &&
        msg.timestamp - allMsg[idx - 1].timestamp < 60_000 &&
        allMsg[idx - 1].from === msg.from

      return (
        <ChatEntry
          key={msg.id ?? idx}
          hideMetadata={hideMetadata}
          entry={msg}
          messageFormatter={formatChatMessageLinks}
        />
      )
    })
    // This ensures that the chat message list is updated to reflect any changes in participant information.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, participants])

  return (
    <Div
      display={'flex'}
      padding={'0 1.5rem'}
      flexGrow={1}
      flexDirection={'column'}
      minHeight={0}
      {...props}
    >
      <Text
        variant="sm"
        className={css({
          padding: '0.75rem',
          backgroundColor: 'greyscale.50',
          borderRadius: 4,
          marginBottom: '0.75rem',
        })}
      >
        {t('disclaimer')}
      </Text>
      <Div
        flexGrow={1}
        flexDirection={'column'}
        minHeight={0}
        overflowY="scroll"
      >
        <ul className="lk-list lk-chat-messages" ref={ulRef}>
          {renderedMessages}
        </ul>
      </Div>
      <ChatInput
        inputRef={inputRef}
        onSubmit={(e) => handleSubmit(e)}
        onUploadFiles={handleUploadFiles}
        isSending={isSending}
      />
    </Div>
  )
}
