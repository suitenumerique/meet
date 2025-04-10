import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio/index'
import { useRoomContext } from '@livekit/components-react'
import { Spinner } from '@/primitives/Spinner'
import { useEffect, useMemo } from 'react'
import { Text } from '@/primitives'
import { RemoteParticipant, RoomEvent } from 'livekit-client'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications/NotificationType'
import { RecordingStatus, recordingStore } from '@/stores/recording'

export const RecordingStateToast = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingBadge',
  })
  const room = useRoomContext()

  const recordingSnap = useSnapshot(recordingStore)

  useEffect(() => {
    if (room.isRecording && recordingSnap.status == RecordingStatus.STOPPED) {
      recordingStore.status = RecordingStatus.ANY_STARTED
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.isRecording])

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      const notification = decodeNotificationDataReceived(payload)

      if (!participant || !notification) return

      switch (notification.type) {
        case NotificationType.TranscriptionStarted:
          recordingStore.status = RecordingStatus.TRANSCRIPT_STARTING
          break
        case NotificationType.TranscriptionStopped:
          recordingStore.status = RecordingStatus.TRANSCRIPT_STOPPING
          break
        case NotificationType.ScreenRecordingStarted:
          recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTING
          break
        case NotificationType.ScreenRecordingStopped:
          recordingStore.status = RecordingStatus.SCREEN_RECORDING_STOPPING
          break
        default:
          return
      }
    }

    const handleRecordingStatusChanged = (status: boolean) => {
      if (!status) {
        recordingStore.status = RecordingStatus.STOPPED
      } else if (recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTING) {
        recordingStore.status = RecordingStatus.TRANSCRIPT_STARTED
      } else if (
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTING
      ) {
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTED
      } else {
        recordingStore.status = RecordingStatus.ANY_STARTED
      }
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room, recordingSnap])

  const key = useMemo(() => {
    switch (recordingSnap.status) {
      case RecordingStatus.TRANSCRIPT_STARTED:
        return 'transcript.started'
      case RecordingStatus.TRANSCRIPT_STOPPING:
        return 'transcript.stopping'
      case RecordingStatus.TRANSCRIPT_STARTING:
        return 'transcript.starting'
      case RecordingStatus.SCREEN_RECORDING_STARTED:
        return 'screenRecording.started'
      case RecordingStatus.SCREEN_RECORDING_STOPPING:
        return 'screenRecording.stopping'
      case RecordingStatus.SCREEN_RECORDING_STARTING:
        return 'screenRecording.starting'
      case RecordingStatus.ANY_STARTED:
        return 'any.started'
      default:
        return
    }
  }, [recordingSnap])

  if (!key) return

  return (
    <div
      className={css({
        display: 'flex',
        position: 'fixed',
        top: '10px',
        left: '10px',
        paddingY: '0.25rem',
        paddingX: '0.75rem 0.75rem',
        backgroundColor: 'primaryDark.100',
        borderColor: 'white',
        border: '1px solid',
        color: 'white',
        borderRadius: '4px',
        gap: '0.5rem',
      })}
    >
      <Spinner size={20} variant="dark" />
      <Text
        variant={'sm'}
        className={css({
          fontWeight: '500 !important',
        })}
      >
        {t(key)}
      </Text>
    </div>
  )
}
