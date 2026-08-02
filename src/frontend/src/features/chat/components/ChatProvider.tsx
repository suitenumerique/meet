// features/rooms/chat/ChatProvider.tsx — renders no DOM, mounted once at room level
import { ref } from 'valtio'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useEffect } from 'react'
import { useChat, useRoomContext } from '@livekit/components-react'
import {
  appendRow,
  chatStore,
  resetChatStore,
  setChatVisibility,
} from '@/stores/chat'
import { useReceiveChatMedia } from '../media/useReceiveChatMedia'
import {
  LocalParticipant,
  Participant,
  RemoteParticipant,
  RoomEvent,
} from 'livekit-client'

export const ChatProvider = () => {
  const { send, chatMessages, isSending } = useChat()
  const { isChatOpen } = useSidePanel()

  const room = useRoomContext()

  useReceiveChatMedia()

  useEffect(() => {
    resetChatStore()
  }, [])

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

  // Unread is counted over chat rows, which see both text messages and the
  // images arriving on byte streams. `chatMessages` only ever holds the former.
  useEffect(() => {
    setChatVisibility(isChatOpen)
  }, [isChatOpen])

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
