import { useEffect } from 'react'
import {
  useParticipantAttribute,
  useRoomContext,
} from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { ParticipantEvent, RoomEvent } from 'livekit-client'
import { reportError } from '@/features/analytics/telemetry'
import { toastQueue } from '@/features/notifications/components/ToastProvider'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationDuration } from '@/features/notifications/NotificationDuration'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { AWAY_ATTRIBUTE } from '@/features/rooms/livekit/constants/awayStatus'
import {
  isCaptureBlocked,
  isCaptureRestoring,
} from '@/features/rooms/livekit/utils/awayTransition'
import { enforceAwayCapture } from '@/features/rooms/livekit/utils/enforceAwayCapture'

/** Enforce muted capture even when tracks reappear after reconnection. */
export function AwayMediaGuard() {
  const room = useRoomContext()
  const participant = room.localParticipant
  const away =
    useParticipantAttribute(AWAY_ATTRIBUTE, { participant }) === 'away'
  const { t } = useTranslation('rooms')
  const announce = useScreenReaderAnnounce()

  useEffect(() => {
    let active = true
    let stopping = false
    let alerted = false
    const shouldStop = () =>
      active && (away || isCaptureBlocked(room)) && !isCaptureRestoring(room)

    const enforceAway = async () => {
      if (!shouldStop() || stopping) return
      stopping = true
      try {
        await enforceAwayCapture(participant, shouldStop)
        if (!participant.isCameraEnabled && !participant.isMicrophoneEnabled) {
          alerted = false
        }
      } catch (error) {
        if (!active) return
        reportError('generic_failure', error, { context: 'enforce_away_media' })
        if (!alerted) {
          alerted = true
          const message = t('controls.away.captureFailure')
          announce(message, 'assertive')
          toastQueue.add(
            { type: NotificationType.AwayModeFailure, message },
            { timeout: NotificationDuration.ALERT }
          )
        }
      } finally {
        stopping = false
      }
    }

    const onMediaChange = () => {
      void enforceAway()
    }
    participant.on(ParticipantEvent.LocalTrackPublished, onMediaChange)
    participant.on(ParticipantEvent.TrackUnmuted, onMediaChange)
    room.on(RoomEvent.Reconnected, onMediaChange)
    void enforceAway()
    return () => {
      active = false
      participant.off(ParticipantEvent.LocalTrackPublished, onMediaChange)
      participant.off(ParticipantEvent.TrackUnmuted, onMediaChange)
      room.off(RoomEvent.Reconnected, onMediaChange)
    }
  }, [room, participant, away, t, announce])

  return null
}
