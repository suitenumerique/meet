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
import { TranscriptionStatus, transcriptionStore } from '@/stores/transcription'

export const TranscriptStateToast = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'recording.transcript' })
  const room = useRoomContext()

  const transcriptionSnap = useSnapshot(transcriptionStore)

  useEffect(() => {
    if (room.isRecording) {
      transcriptionStore.status = TranscriptionStatus.STARTED
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant
    ) => {
      const notification = decodeNotificationDataReceived(payload)

      if (!participant || !notification) return

      switch (notification.type) {
        case NotificationType.TranscriptionStarted:
          transcriptionStore.status = TranscriptionStatus.STARTING
          break
        case NotificationType.TranscriptionStopped:
          transcriptionStore.status = TranscriptionStatus.STOPPING
          break
        default:
          return
      }
    }

    const handleRecordingStatusChanged = (status: boolean) => {
      transcriptionStore.status = status
        ? TranscriptionStatus.STARTED
        : TranscriptionStatus.STOPPED
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room])

  const key = useMemo(() => {
    switch (transcriptionSnap.status) {
      case TranscriptionStatus.STOPPING:
        return 'stopping'
      case TranscriptionStatus.STARTING:
        return 'starting'
      default:
        return 'started'
    }
  }, [transcriptionSnap])

  if (transcriptionSnap.status == TranscriptionStatus.STOPPED) return

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
