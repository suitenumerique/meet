import { A, Button, Div, Text } from '@/primitives'

import fourthSlide from '@/assets/intro-slider/4_record.png'
import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useStartRecording,
} from '@/features/rooms/api/startRecording'
import { useStopRecording } from '@/features/rooms/api/stopRecording'
import { useEffect, useMemo, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { NotificationPayload } from '@/features/notifications/NotificationPayload'
import { NotificationType } from '@/features/notifications/NotificationType'
import { useSnapshot } from 'valtio/index'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { CRISP_HELP_ARTICLE_RECORDING } from '@/utils/constants'

export const ScreenRecording = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation('rooms', { keyPrefix: 'screenRecording' })

  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { mutateAsync: stopRecordingRoom } = useStopRecording()

  const recordingSnap = useSnapshot(recordingStore)

  const room = useRoomContext()

  useEffect(() => {
    const handleRecordingStatusChanged = () => {
      setIsLoading(false)
    }
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room])

  const notifyParticipant = async (status: NotificationType) => {
    const encoder = new TextEncoder()
    const payload: NotificationPayload = {
      type: status,
    }
    const data = encoder.encode(JSON.stringify(payload))
    await room.localParticipant.publishData(data, {
      reliable: true,
    })
  }

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      setIsLoading(true)
      if (room.isRecording) {
        await stopRecordingRoom({ id: roomId })
        await notifyParticipant(NotificationType.ScreenRecordingStopped)
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STOPPING
      } else {
        await startRecordingRoom({
          id: roomId,
          mode: RecordingMode.ScreenRecording,
        })
        await notifyParticipant(NotificationType.ScreenRecordingStarted)
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTING
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
      setIsLoading(false)
    }
  }

  const isDisabled = useMemo(
    () =>
      isLoading ||
      recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTING ||
      recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STOPPING,
    [isLoading, recordingSnap]
  )

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
    >
      <img
        src={fourthSlide}
        alt={''}
        className={css({
          minHeight: '309px',
          marginBottom: '1rem',
        })}
      />

      {room.isRecording ? (
        <>
          <Text>{t('stop.heading')}</Text>
          <Text
            variant="note"
            wrap={'pretty'}
            centered
            className={css({
              textStyle: 'sm',
              marginBottom: '2.5rem',
              marginTop: '0.25rem',
            })}
          >
            {t('stop.body')}
          </Text>
          <Button
            isDisabled={isDisabled}
            onPress={() => handleTranscript()}
            data-attr="stop-transcript"
            size="sm"
            variant="tertiary"
          >
            {t('stop.button')}
          </Button>
        </>
      ) : (
        <>
          <Text>{t('start.heading')}</Text>
          <Text
            variant="note"
            wrap={'pretty'}
            centered
            className={css({
              textStyle: 'sm',
              maxWidth: '90%',
              marginBottom: '2.5rem',
              marginTop: '0.25rem',
            })}
          >
            {t('start.body')} <br />{' '}
            <A href={CRISP_HELP_ARTICLE_RECORDING} target="_blank">
              {t('start.linkMore')}
            </A>
          </Text>
          <Button
            isDisabled={isDisabled}
            onPress={() => handleTranscript()}
            data-attr="start-transcript"
            size="sm"
            variant="tertiary"
          >
            {t('start.button')}
          </Button>
        </>
      )}
    </Div>
  )
}
