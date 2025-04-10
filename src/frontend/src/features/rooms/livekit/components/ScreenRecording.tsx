import { A, Button, Div, Text } from '@/primitives'

import fourthSlide from '@/assets/intro-slider/4_record.png'
import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useStartRecording,
  useStopRecording,
} from '@/features/recording'
import { useEffect, useMemo, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { CRISP_HELP_ARTICLE_RECORDING } from '@/utils/constants'
import {
  useIsRecordingTransitioning,
  useIsScreenRecordingStarted,
  useIsTranscriptStarted,
} from '@/features/recording'

import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'

export const ScreenRecording = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation('rooms', { keyPrefix: 'screenRecording' })

  const { notifyParticipants } = useNotifyParticipants()

  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { mutateAsync: stopRecordingRoom } = useStopRecording()

  const isScreenRecordingStarted = useIsScreenRecordingStarted()
  const isTranscriptStarted = useIsTranscriptStarted()

  const room = useRoomContext()
  const isRecordingTransitioning = useIsRecordingTransitioning()

  useEffect(() => {
    const handleRecordingStatusChanged = () => {
      setIsLoading(false)
    }
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room])

  const handleScreenRecording = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      setIsLoading(true)
      if (room.isRecording) {
        await stopRecordingRoom({ id: roomId })
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STOPPING
        await notifyParticipants({
          type: NotificationType.ScreenRecordingStopped,
        })
      } else {
        await startRecordingRoom({
          id: roomId,
          mode: RecordingMode.ScreenRecording,
        })
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTING
        await notifyParticipants({
          type: NotificationType.ScreenRecordingStarted,
        })
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
      setIsLoading(false)
    }
  }

  const isDisabled = useMemo(
    () => isLoading || isRecordingTransitioning || isTranscriptStarted,
    [isLoading, isRecordingTransitioning, isTranscriptStarted]
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

      {isScreenRecordingStarted ? (
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
            onPress={() => handleScreenRecording()}
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
            onPress={() => handleScreenRecording()}
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
