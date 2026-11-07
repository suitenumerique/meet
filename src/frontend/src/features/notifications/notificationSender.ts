import {
  type RemoteParticipant,
  type Room,
  type RoomEventCallbacks,
  RoomEvent,
} from 'livekit-client'
import type { ApiConfig } from '@/api/useConfig'
import { isRecordingOpenToParticipants } from '@/features/recording/hooks/useCanRecord'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { getParticipantIsAuthenticated } from '@/features/rooms/utils/getParticipantIsAuthenticated'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import type { NotificationPayload } from './NotificationPayload'
import { NotificationType } from './NotificationType'
import { decodeNotificationDataReceived } from './utils'

export type SenderRules = {
  isRecordingOpenToParticipants: boolean
  everyoneCanMute: boolean
}

const HOSTS_ONLY: SenderRules = {
  isRecordingOpenToParticipants: false,
  everyoneCanMute: false,
}

export const senderRulesFor = (
  config?: ApiConfig,
  roomData?: ApiRoom
): SenderRules => {
  const everyoneCanMute = roomData?.configuration?.everyone_can_mute
  return {
    isRecordingOpenToParticipants: isRecordingOpenToParticipants(
      config,
      roomData
    ),
    // The backend reads a missing setting as on and a stored null as off.
    everyoneCanMute: everyoneCanMute === undefined || !!everyoneCanMute,
  }
}

export const isAllowedNotificationSender = (
  type: NotificationType,
  sender: RemoteParticipant | undefined,
  senderIdentity: string | undefined,
  rules: SenderRules
): boolean => {
  const isHost = !!sender && getParticipantIsRoomAdminOrOwner(sender)

  switch (type) {
    case NotificationType.TranscriptionLimitReached:
    case NotificationType.ScreenRecordingLimitReached:
    case NotificationType.TranscriptionInterrupted:
    case NotificationType.ScreenRecordingInterrupted:
    case NotificationType.TranscriptionFailed:
    case NotificationType.ScreenRecordingFailed:
    case NotificationType.TranscriptionAborted:
    case NotificationType.ScreenRecordingAborted:
    case NotificationType.ParticipantWaiting:
      // A participant the roster has not listed yet also comes with no sender,
      // so only the identity the media server stamped tells them from the backend.
      return senderIdentity === '' && !sender
    case NotificationType.PermissionsRemoved:
      return isHost
    case NotificationType.ParticipantMuted:
      return isHost || (!!sender && rules.everyoneCanMute)
    case NotificationType.TranscriptionStarted:
    case NotificationType.TranscriptionStopped:
    case NotificationType.ScreenRecordingStarted:
    case NotificationType.ScreenRecordingStopped:
      return (
        isHost ||
        (rules.isRecordingOpenToParticipants &&
          !!sender &&
          getParticipantIsAuthenticated(sender))
      )
    case NotificationType.ReactionReceived:
    case NotificationType.TranscriptionRequested:
    case NotificationType.ScreenRecordingRequested:
      return !!sender
    default:
      return false
  }
}

export const subscribeToNotifications = (
  room: Room,
  onNotification: (
    notification: NotificationPayload,
    sender?: RemoteParticipant
  ) => void,
  getRules: () => SenderRules = () => HOSTS_ONLY
) => {
  const handleDataReceived: RoomEventCallbacks['dataReceived'] = (
    payload,
    sender,
    _kind,
    _topic,
    _encryptionType,
    senderIdentity
  ) => {
    const notification = decodeNotificationDataReceived(payload)
    if (
      notification &&
      isAllowedNotificationSender(
        notification.type,
        sender,
        senderIdentity,
        getRules()
      )
    ) {
      onNotification(notification, sender)
    }
  }
  room.on(RoomEvent.DataReceived, handleDataReceived)
  return () => {
    room.off(RoomEvent.DataReceived, handleDataReceived)
  }
}
