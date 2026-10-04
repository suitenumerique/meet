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
import {
  breakoutRecipients,
  isInMainRoomOfSplit,
  isToEveryRoom,
  readSignal,
  TO_EVERY_ROOM,
} from '@/features/breakout/utils/group'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
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
  const { isInMyGroup, isOpen } = useBreakoutGroup()
  // How many of chatMessages have been looked at, shown or not.
  const seen = React.useRef(0)

  const room = useRoomContext()

  useEffect(() => {
    resetChatStore()
  }, [])

  // Each split starts with the host writing to the main room only.
  useEffect(() => {
    if (!isOpen) chatStore.toEveryRoom = false
  }, [isOpen])

  // Each new message is shown and announced once. In a split, one from another
  // room never is, an older tab's included, unless a host sent it to every room.
  useEffect(() => {
    let latest: ReceivedChatMessage | undefined
    for (; seen.current < chatMessages.length; seen.current++) {
      const message = chatMessages[seen.current]
      const toEveryRoom = isToEveryRoom(message)
      if (message.from && !isInMyGroup(message.from.identity) && !toEveryRoom)
        continue
      appendRow(message, toEveryRoom)
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
      // A host in the main room may reach every room: no recipients, marked.
      const toEveryRoom =
        chatStore.toEveryRoom &&
        isInMainRoomOfSplit(
          readSignal(room.metadata),
          room.localParticipant.identity
        ) &&
        getParticipantIsRoomAdminOrOwner(room.localParticipant)
      const destinationIdentities = toEveryRoom
        ? undefined
        : breakoutRecipients(room)
      if (!toEveryRoom && !destinationIdentities) return send(message, options)
      // useChat's send also copies the text to the whole meeting in the legacy
      // format, so a split sends the text stream alone, to the group.
      const attributes = toEveryRoom
        ? { ...options?.attributes, [TO_EVERY_ROOM]: 'true' }
        : options?.attributes
      chatStore.isSending = true
      try {
        const { id } = await room.localParticipant.sendText(message, {
          topic: DataTopic.CHAT,
          ...options,
          ...(toEveryRoom ? { attributes } : { destinationIdentities }),
        })
        const sent: ReceivedChatMessage = {
          id,
          timestamp: Date.now(),
          message,
          type: 'chatMessage',
          from: room.localParticipant,
          attributes,
        }
        appendRow(sent, toEveryRoom)
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
