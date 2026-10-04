// features/rooms/chat/ChatProvider.tsx — renders no DOM, mounted once at room level
import { ref } from 'valtio'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import React, { useEffect } from 'react'
import { useChat, useRoomContext } from '@livekit/components-react'
import { appendRow, chatStore, resetChatStore } from '@/stores/chat'
import {
  DataTopic,
  type ChatMessage,
  type ReceivedChatMessage,
} from '@livekit/components-core'
import { useBreakoutGroup } from '@/features/breakout/hooks/useBreakoutGroup'
import { breakoutRecipients } from '@/features/breakout/utils/group'
import {
  LocalParticipant,
  Participant,
  RemoteParticipant,
  RoomEvent,
  type SendTextOptions,
} from 'livekit-client'

export const ChatProvider = () => {
  const lastReadMsgAt = React.useRef<ChatMessage['timestamp']>(0)
  const { send, chatMessages, isSending } = useChat()
  const { isChatOpen } = useSidePanel()
  const { isInMyGroup } = useBreakoutGroup()
  // How many of chatMessages have been looked at, shown or not.
  const seen = React.useRef(0)

  const room = useRoomContext()

  useEffect(() => {
    resetChatStore()
  }, [])

  // Each new message is shown and announced once. In a split, one from another
  // room never is, an older tab's included.
  useEffect(() => {
    let latest: ReceivedChatMessage | undefined
    for (; seen.current < chatMessages.length; seen.current++) {
      const message = chatMessages[seen.current]
      if (message.from && !isInMyGroup(message.from.identity)) continue
      appendRow(message)
      latest = message
    }
    if (!latest) return
    // TEMPORARY: This is a brittle workaround that relies on message count tracking
    // due to recent LiveKit useChat changes breaking the previous implementation
    // (see https://github.com/livekit/components-js/issues/1158)
    // Remove this once we refactor chat to use the new text stream approach
    const from = latest.from as RemoteParticipant | LocalParticipant | undefined
    room.emit(RoomEvent.ChatMessage, latest, from)
  }, [chatMessages, isInMyGroup, room])

  useEffect(() => {
    chatStore.send = ref(async (message: string, options?: SendTextOptions) => {
      const destinationIdentities = breakoutRecipients(room)
      if (!destinationIdentities) return send(message, options)
      // useChat's send also copies the text to the whole meeting in the legacy
      // format, so a split sends the text stream alone, to the group.
      chatStore.isSending = true
      try {
        const { id } = await room.localParticipant.sendText(message, {
          topic: DataTopic.CHAT,
          ...options,
          destinationIdentities,
        })
        const sent: ReceivedChatMessage = {
          id,
          timestamp: Date.now(),
          message,
          type: 'chatMessage',
          from: room.localParticipant,
          attributes: options?.attributes,
        }
        appendRow(sent)
        return sent
      } finally {
        chatStore.isSending = false
      }
    })
  }, [send, room])

  useEffect(() => {
    chatStore.isSending = isSending
  }, [isSending])

  // Set the unread messages count, from the rows actually shown
  useEffect(() => {
    const rows = chatStore.rows
    if (rows.length === 0) return
    if (isChatOpen) {
      lastReadMsgAt.current = rows[rows.length - 1].timestamp
      chatStore.unreadMessages = 0
      return
    }
    chatStore.unreadMessages = rows.filter(
      (row) =>
        !row.isLocal &&
        (!lastReadMsgAt.current || row.timestamp > lastReadMsgAt.current)
    ).length
  }, [chatMessages, isChatOpen])

  // Listen to participant name changes
  useEffect(() => {
    const setName = (p: Participant) => {
      chatStore.names[p.identity] = p.name || p.identity
    }
    const onNameChanged = (_name: string, p: Participant) => setName(p)
    room.on(RoomEvent.ParticipantNameChanged, onNameChanged)
    return () => {
      room.off(RoomEvent.ParticipantNameChanged, onNameChanged)
    }
  }, [room])

  return null
}
