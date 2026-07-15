import type { ChatMessage, ChatOptions } from '@livekit/components-core'
import React from 'react'
import {
  formatChatMessageLinks,
  useChat,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import {
  ListBox,
  ListBoxItem,
  ListLayout,
  Virtualizer,
} from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { chatStore } from '@/stores/chat'
import { Div, Text } from '@/primitives'
import { ChatInput } from '../components/chat/Input'
import { ChatEntry } from '../components/chat/Entry'
import { useSidePanel } from '../hooks/useSidePanel'
import {
  type LocalParticipant,
  type RemoteParticipant,
  RoomEvent,
} from 'livekit-client'
import { css } from '@/styled-system/css'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'

export interface ChatProps
  extends React.HTMLAttributes<HTMLDivElement>, ChatOptions {}

// Estimated height of a chat entry in px. ListLayout measures the real
// rendered height of each row; this value is only used to size the
// scrollbar before rows have been measured.
const ESTIMATED_ROW_HEIGHT = 56

interface ChatListItem {
  id: string | number
  msg: ChatMessage
  hideMetadata: boolean
}

/**
 * The Chat component adds a basic chat functionality to the LiveKit room. The messages are distributed to all participants
 * in the room. Only users who are in the room at the time of dispatch will receive the message.
 *
 * The message list is virtualized with React Aria's Virtualizer + ListLayout:
 * only visible rows are mounted, so long chat histories stay cheap to render.
 * The ListBox itself is the scroll container.
 */
export function Chat({ ...props }: ChatProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat' })

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const room = useRoomContext()
  const { send, chatMessages, isSending } = useChat()

  const { isChatOpen, isSidePanelOpen } = useSidePanel()
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
    shouldRestoreOnClose: () => !isSidePanelOpen,
  })

  // Use to trigger a re-render when the participant list changes.
  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [RoomEvent.ParticipantNameChanged],
  })

  const lastReadMsgAt = React.useRef<ChatMessage['timestamp']>(0)
  const previousMessageCount = React.useRef(0)

  async function handleSubmit(text: string) {
    if (!send || !text) return
    await send(text)
    inputRef?.current?.focus({ preventScroll: true })
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
    if (chatMessages.length > 0 && listRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      })
    }
  }, [listRef, chatMessages])

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

  // The ListBox render function only receives the item, so precompute
  // hideMetadata (metadata grouping) and a stable id for each message here.
  const items: ChatListItem[] = React.useMemo(() => {
    return chatMessages.map((msg, idx, allMsg) => ({
      id: msg.id ?? `${msg.timestamp}-${idx}`,
      msg,
      hideMetadata:
        idx >= 1 &&
        msg.timestamp - allMsg[idx - 1].timestamp < 60_000 &&
        allMsg[idx - 1].from === msg.from,
    }))
    // `remoteParticipants` is included so rows re-render when participant
    // information (name) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, remoteParticipants])

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
      <Div flexGrow={1} minHeight={0}>
        <Virtualizer
          layout={ListLayout}
          layoutOptions={{
            estimatedRowSize: ESTIMATED_ROW_HEIGHT,
            gap: 4,
            padding: 4,
          }}
        >
          <ListBox
            ref={listRef}
            aria-label={t('messagesLabel', 'Chat messages')}
            items={items}
            selectionMode="none"
            className="lk-list lk-chat-messages"
            style={{
              display: 'block',
              height: '100%',
              width: '100%',
              overflow: 'auto',
            }}
          >
            {(item: ChatListItem) => (
              <ListBoxItem
                textValue={item.msg.message}
                style={{ width: '100%' }}
              >
                <ChatEntry
                  hideMetadata={item.hideMetadata}
                  entry={item.msg}
                  messageFormatter={formatChatMessageLinks}
                />
              </ListBoxItem>
            )}
          </ListBox>
        </Virtualizer>
      </Div>
      <ChatInput
        inputRef={inputRef}
        onSubmit={(e) => handleSubmit(e)}
        isSending={isSending}
      />
    </Div>
  )
}
