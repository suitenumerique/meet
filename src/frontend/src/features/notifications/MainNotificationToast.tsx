import { useCallback, useEffect, useMemo, useRef } from 'react'
import { NoisyNotificationBatcher } from './NoisyNotificationBatcher'
import { useRoomContext } from '@livekit/components-react'
import { Participant, RemoteParticipant, RoomEvent } from 'livekit-client'
import { type ChatMessage, isMobileBrowser } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { NotificationType } from './NotificationType'
import { NotificationDuration } from './NotificationDuration'
import { decodeNotificationDataReceived } from './utils'
import { useNotificationSound } from '@/features/notifications/hooks/useSoundNotification'
import { toastQueue } from './components/ToastProvider'
import { layoutStore } from '@/stores/layout'
import { PanelId } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { Emoji } from '@/features/reactions/types'
import { useReactions } from '@/features/reactions/hooks/useReactions'
import { NotificationProvider } from './NotificationProvider'
import { useConfig } from '@/api/useConfig'

export const MainNotificationToast = () => {
  const room = useRoomContext()
  const { data } = useConfig()
  const { triggerNotificationSound } = useNotificationSound()
  const { t } = useTranslation('notifications')
  const announce = useScreenReaderAnnounce()

  const { appendReaction } = useReactions()

  const latest = useRef({ data, triggerNotificationSound, announce, t })
  useEffect(() => {
    latest.current = { data, triggerNotificationSound, announce, t }
  }, [data, triggerNotificationSound, announce, t])

  // Keep pending batches across renders, but never across rooms.
  const noisyNotifications = useMemo(
    () =>
      new NoisyNotificationBatcher(
        (content, notify = true) => {
          const current = latest.current
          if (
            content.type === NotificationType.ParticipantJoined &&
            (!current.data ||
              room.numParticipants >= current.data.max_participants_for_sound)
          ) {
            toastQueue.discardWhere(
              (item) => item.type === NotificationType.ParticipantJoined
            )
            return ''
          }
          if (
            content.type === NotificationType.MessageReceived &&
            layoutStore.activePanelId === PanelId.CHAT
          ) {
            if (notify) current.triggerNotificationSound(content.type)
            return 'chat-panel'
          }
          const key = toastQueue.add(content, {
            timeout:
              content.type === NotificationType.MessageReceived
                ? NotificationDuration.MESSAGE
                : content.type === NotificationType.HandRaised
                  ? NotificationDuration.HAND_RAISED
                  : NotificationDuration.PARTICIPANT_JOINED,
          })
          if (key && notify) {
            current.triggerNotificationSound(content.type)
            if (content.type === NotificationType.MessageReceived) {
              current.announce(
                (content.count ?? 1) > 1
                  ? current.t('messagesSummary', { count: content.count })
                  : current.t('chatMessageReceived', {
                      name:
                        content.participant?.name || current.t('defaultName'),
                      message: content.message,
                    }),
                'polite'
              )
            }
          }
          return key
        },
        (key) =>
          key === 'chat-panel'
            ? layoutStore.activePanelId === PanelId.CHAT
            : toastQueue.has(key)
      ),
    [room]
  )

  useEffect(() => {
    const handleChatMessage = (
      chatMessage: ChatMessage,
      participant?: Participant | undefined
    ) => {
      if (!participant || participant.isLocal) return
      noisyNotifications.add({
        participant,
        message: chatMessage.message,
        type: NotificationType.MessageReceived,
      })
    }
    room.on(RoomEvent.ChatMessage, handleChatMessage)
    return () => {
      room.off(RoomEvent.ChatMessage, handleChatMessage)
    }
  }, [room, noisyNotifications])

  const handleEmoji = useCallback(
    (emoji: string, participant: Participant) => {
      if (!emoji || !Object.values(Emoji).includes(emoji as Emoji)) return
      appendReaction(emoji as Emoji, participant)
    },
    [appendReaction]
  )

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      const notification = decodeNotificationDataReceived(payload)

      if (!notification) return

      switch (notification.type) {
        case NotificationType.ParticipantMuted:
          if (participant) {
            toastQueue.add(
              {
                participant,
                type: NotificationType.ParticipantMuted,
              },
              { timeout: NotificationDuration.ALERT }
            )
          }

          break
        case NotificationType.ReactionReceived:
          if (notification.data?.emoji && participant)
            handleEmoji(notification.data.emoji, participant)
          break
        case NotificationType.TranscriptionStarted:
        case NotificationType.TranscriptionStopped:
        case NotificationType.ScreenRecordingStarted:
        case NotificationType.ScreenRecordingStopped:
        case NotificationType.TranscriptionLimitReached:
        case NotificationType.ScreenRecordingLimitReached:
        case NotificationType.TranscriptionInterrupted:
        case NotificationType.ScreenRecordingInterrupted:
        case NotificationType.TranscriptionFailed:
        case NotificationType.ScreenRecordingFailed:
        case NotificationType.TranscriptionAborted:
        case NotificationType.ScreenRecordingAborted:
          toastQueue.add(
            {
              participant,
              type: notification.type,
            },
            { timeout: NotificationDuration.ALERT }
          )
          break
        case NotificationType.TranscriptionRequested:
        case NotificationType.ScreenRecordingRequested:
          toastQueue.add(
            {
              participant,
              type: notification.type,
            },
            { timeout: NotificationDuration.RECORDING_REQUESTED }
          )
          break
        case NotificationType.PermissionsRemoved: {
          const removedSources = notification?.data?.removedSources
          if (!removedSources?.length) break
          toastQueue.add(
            {
              participant,
              type: notification.type,
              removedSources: removedSources,
            },
            { timeout: NotificationDuration.ALERT }
          )
          break
        }
        default:
          return
      }
    }
    room.on(RoomEvent.DataReceived, handleDataReceived)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room, handleEmoji])

  useEffect(() => {
    const showJoinNotification = (participant: Participant) => {
      if (!data || room.numParticipants >= data.max_participants_for_sound) {
        noisyNotifications.cancel(NotificationType.ParticipantJoined)
        toastQueue.discardWhere(
          (content) => content.type === NotificationType.ParticipantJoined
        )
        return
      }
      if (isMobileBrowser()) return
      noisyNotifications.add({
        participant,
        type: NotificationType.ParticipantJoined,
      })
    }
    room.on(RoomEvent.ParticipantConnected, showJoinNotification)
    return () => {
      room.off(RoomEvent.ParticipantConnected, showJoinNotification)
    }
  }, [room, data, noisyNotifications])

  useEffect(() => {
    const handleAttributeChanged = (
      changedAttributes: Record<string, string>,
      participant: Participant
    ) => {
      if (!participant.isLocal || !('room_role' in changedAttributes)) return
      const newRole = changedAttributes['room_role']
      toastQueue.add(
        {
          participant,
          type: NotificationType.RoleChanged,
          newRole: newRole,
        },
        {
          timeout: NotificationDuration.ROLE_CHANGED,
        }
      )
    }
    room.on(RoomEvent.ParticipantAttributesChanged, handleAttributeChanged)

    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, handleAttributeChanged)
    }
  }, [room])

  useEffect(() => {
    const removeParticipantNotifications = (participant: Participant) => {
      noisyNotifications.removeParticipant(participant)
      toastQueue.removeParticipant(participant)
    }
    room.on(RoomEvent.ParticipantDisconnected, removeParticipantNotifications)
    return () => {
      room.off(
        RoomEvent.ParticipantDisconnected,
        removeParticipantNotifications
      )
    }
  }, [room, noisyNotifications])

  useEffect(() => {
    const handleNotificationReceived = (
      changedAttributes: Record<string, string>,
      participant: Participant
    ) => {
      if (!participant) return
      if (isMobileBrowser()) return
      if (participant.isLocal) return

      if (!('handRaisedAt' in changedAttributes)) return

      if (!changedAttributes.handRaisedAt) {
        noisyNotifications.removeParticipant(
          participant,
          NotificationType.HandRaised
        )
        toastQueue.removeParticipant(participant, NotificationType.HandRaised)
      } else if (
        !toastQueue.visibleToasts.some(
          (toast) =>
            toast.content.type === NotificationType.HandRaised &&
            (toast.content.participants ?? [toast.content.participant]).some(
              (item) => item?.identity === participant.identity
            )
        )
      ) {
        noisyNotifications.add({
          participant,
          type: NotificationType.HandRaised,
        })
      }
    }

    room.on(RoomEvent.ParticipantAttributesChanged, handleNotificationReceived)

    return () => {
      room.off(
        RoomEvent.ParticipantAttributesChanged,
        handleNotificationReceived
      )
    }
  }, [room, noisyNotifications])

  useEffect(() => {
    const closeAllToasts = () => {
      noisyNotifications.clear()
      toastQueue.clear()
    }
    room.on(RoomEvent.Disconnected, closeAllToasts)
    return () => {
      room.off(RoomEvent.Disconnected, closeAllToasts)
      closeAllToasts()
    }
  }, [room, noisyNotifications])

  // Without this line, when the component first renders,
  // the 'notifications' namespace might not be loaded yet
  useTranslation(['notifications'])

  return <NotificationProvider />
}
