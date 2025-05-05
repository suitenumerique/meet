import { useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { Participant, RemoteParticipant, RoomEvent } from 'livekit-client'
import { ChatMessage, isMobileBrowser } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { Div } from '@/primitives'
import { NotificationType } from './NotificationType'
import { NotificationDuration } from './NotificationDuration'
import { decodeNotificationDataReceived } from './utils'
import { useNotificationSound } from '@/features/notifications/hooks/useSoundNotification'
import { ToastProvider, toastQueue } from './components/ToastProvider'
import { WaitingParticipantNotification } from './components/WaitingParticipantNotification'
import {
  Emoji,
  Reaction,
} from '@/features/rooms/livekit/components/controls/ReactionsToggle'
import {
  ANIMATION_DURATION,
  ReactionPortals,
} from '@/features/rooms/livekit/components/ReactionPortal'
import { safeParseMetadata } from '@/features/rooms/utils/safeParseMetadata'

export const MainNotificationToast = () => {
  const room = useRoomContext()
  const { triggerNotificationSound } = useNotificationSound()

  const [reactions, setReactions] = useState<Reaction[]>([])
  const instanceIdRef = useRef(0)

  useEffect(() => {
    const handleChatMessage = (
      chatMessage: ChatMessage,
      participant?: Participant | undefined
    ) => {
      if (!participant || participant.isLocal) return
      triggerNotificationSound(NotificationType.MessageReceived)
      toastQueue.add(
        {
          participant: participant,
          message: chatMessage.message,
          type: NotificationType.MessageReceived,
        },
        { timeout: NotificationDuration.MESSAGE }
      )
    }
    room.on(RoomEvent.ChatMessage, handleChatMessage)
    return () => {
      room.off(RoomEvent.ChatMessage, handleChatMessage)
    }
  }, [room, triggerNotificationSound])

  const handleEmoji = (emoji: string, participant: Participant) => {
    if (!emoji || !Object.values(Emoji).includes(emoji as Emoji)) return
    const id = instanceIdRef.current++
    setReactions((prev) => [
      ...prev,
      {
        id,
        emoji,
        participant,
      },
    ])
    setTimeout(() => {
      setReactions((prev) => prev.filter((instance) => instance.id !== id))
    }, ANIMATION_DURATION)
  }

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      const notification = decodeNotificationDataReceived(payload)

      if (!participant || !notification) return

      switch (notification.type) {
        case NotificationType.ParticipantMuted:
          toastQueue.add(
            {
              participant,
              type: NotificationType.ParticipantMuted,
            },
            { timeout: NotificationDuration.ALERT }
          )
          break
        case NotificationType.ReactionReceived:
          if (notification.data?.emoji)
            handleEmoji(notification.data.emoji, participant)
          break
        case NotificationType.TranscriptionStarted:
        case NotificationType.TranscriptionStopped:
        case NotificationType.ScreenRecordingStarted:
        case NotificationType.ScreenRecordingStopped:
          toastQueue.add(
            {
              participant,
              type: notification.type,
            },
            { timeout: NotificationDuration.ALERT }
          )
          break
        default:
          return
      }
    }
    room.on(RoomEvent.DataReceived, handleDataReceived)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room])

  useEffect(() => {
    const showJoinNotification = (participant: Participant) => {
      if (isMobileBrowser()) {
        return
      }
      triggerNotificationSound(NotificationType.ParticipantJoined)
      toastQueue.add(
        {
          participant,
          type: NotificationType.ParticipantJoined,
        },
        {
          timeout: NotificationDuration.PARTICIPANT_JOINED,
        }
      )
    }
    room.on(RoomEvent.ParticipantConnected, showJoinNotification)
    return () => {
      room.off(RoomEvent.ParticipantConnected, showJoinNotification)
    }
  }, [room, triggerNotificationSound])

  useEffect(() => {
    const removeParticipantNotifications = (participant: Participant) => {
      toastQueue.visibleToasts.forEach((toast) => {
        if (toast.content.participant === participant) {
          toastQueue.close(toast.key)
        }
      })
    }
    room.on(RoomEvent.ParticipantDisconnected, removeParticipantNotifications)
    return () => {
      room.off(
        RoomEvent.ParticipantDisconnected,
        removeParticipantNotifications
      )
    }
  }, [room])

  useEffect(() => {
    const handleNotificationReceived = (
      prevMetadataStr: string | undefined,
      participant: Participant
    ) => {
      if (!participant) return
      if (isMobileBrowser()) return
      if (participant.isLocal) return

      const prevMetadata = safeParseMetadata(prevMetadataStr)
      const metadata = safeParseMetadata(participant.metadata)

      if (prevMetadata?.raised == metadata?.raised) return

      const existingToast = toastQueue.visibleToasts.find(
        (toast) =>
          toast.content.participant === participant &&
          toast.content.type === NotificationType.HandRaised
      )

      if (existingToast && prevMetadata.raised && !metadata.raised) {
        toastQueue.close(existingToast.key)
        return
      }

      if (!existingToast && !prevMetadata.raised && metadata.raised) {
        triggerNotificationSound(NotificationType.HandRaised)
        toastQueue.add(
          {
            participant,
            type: NotificationType.HandRaised,
          },
          { timeout: NotificationDuration.HAND_RAISED }
        )
      }
    }

    room.on(RoomEvent.ParticipantMetadataChanged, handleNotificationReceived)

    return () => {
      room.off(RoomEvent.ParticipantMetadataChanged, handleNotificationReceived)
    }
  }, [room, triggerNotificationSound])

  useEffect(() => {
    const closeAllToasts = () => {
      toastQueue.visibleToasts.forEach(({ key }) => toastQueue.close(key))
    }
    room.on(RoomEvent.Disconnected, closeAllToasts)
    return () => {
      room.off(RoomEvent.Disconnected, closeAllToasts)
    }
  }, [room])

  // Without this line, when the component first renders,
  // the 'notifications' namespace might not be loaded yet
  useTranslation(['notifications'])

  return (
    <Div position="absolute" bottom={0} right={5} zIndex={1000}>
      <ToastProvider />
      <WaitingParticipantNotification />
      <ReactionPortals reactions={reactions} />
    </Div>
  )
}
