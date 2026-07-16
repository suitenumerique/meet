// features/rooms/chat/ChatProvider.tsx — renders no DOM, mounted once at room level
import { ref } from 'valtio'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import React, { useEffect } from 'react'
import { useChat, useRoomContext } from '@livekit/components-react'
import { appendRow, chatStore } from '@/stores/chat'
import type { ChatMessage } from '@livekit/components-core'
import {
  LocalParticipant,
  Participant,
  RemoteParticipant,
  RoomEvent,
} from 'livekit-client'

export const ChatProvider = () => {
  const lastReadMsgAt = React.useRef<ChatMessage['timestamp']>(0)
  const { send, chatMessages, isSending } = useChat()
  const { isChatOpen } = useSidePanel()

  const room = useRoomContext()

  // Tigger the message notification (temporary)
  useEffect(() => {
    // TEMPORARY: This is a brittle workaround that relies on message count tracking
    // due to recent LiveKit useChat changes breaking the previous implementation
    // (see https://github.com/livekit/components-js/issues/1158)
    // Remove this once we refactor chat to use the new text stream approach
    const latestMessage = chatMessages.slice(-1)[0]
    if (!latestMessage) return
    const from = latestMessage.from as
      | RemoteParticipant
      | LocalParticipant
      | undefined

    room.emit(RoomEvent.ChatMessage, latestMessage, from)
  }, [chatMessages, room])

  useEffect(() => {
    for (let i = chatStore.rows.length; i < chatMessages.length; i++) {
      appendRow(chatMessages[i])
    }
  }, [chatMessages])

  useEffect(() => {
    chatStore.send = ref(send)
  }, [send])

  useEffect(() => {
    chatStore.isSending = isSending
  }, [isSending])

  // Set the unread messages count
  useEffect(() => {
    if (chatMessages.length === 0) return
    const last = chatMessages[chatMessages.length - 1]
    if (isChatOpen) {
      lastReadMsgAt.current = last.timestamp
      chatStore.unreadMessages = 0
      return
    }
    chatStore.unreadMessages = chatMessages.filter(
      (m) => !lastReadMsgAt.current || m.timestamp > lastReadMsgAt.current
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
