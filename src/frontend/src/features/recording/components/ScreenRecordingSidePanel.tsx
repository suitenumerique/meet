import { A, Button, Div, H, Text } from '@/primitives'

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
import { useIsRecordingTransitioning } from '@/features/recording'

import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useSnapshot } from 'valtio/index'
import { Spinner } from '@/primitives/Spinner'

export const ScreenRecordingSidePanel = () => {
  const [isLoading, setIsLoading] = useState(false)
  const recordingSnap = useSnapshot(recordingStore)
  const { t } = useTranslation('rooms', { keyPrefix: 'screenRecording' })

  const { notifyParticipants } = useNotifyParticipants()

  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { mutateAsync: stopRecordingRoom } = useStopRecording()

  const statuses = useMemo(() => {
    return {
      isAnotherModeStarted:
        recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTED,
      isStarting:
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTING,
      isStarted:
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTED,
      isStopping:
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STOPPING,
    }
  }, [recordingSnap])

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
        posthog.capture('screen-recording-started', {})
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
      setIsLoading(false)
    }
  }

  const isDisabled = useMemo(
    () =>
      isLoading || isRecordingTransitioning || statuses.isAnotherModeStarted,
    [isLoading, isRecordingTransitioning, statuses]
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

      {statuses.isStarted ? (
        <>
          <H lvl={3} margin={false}>
            {t('stop.heading')}
          </H>
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
            data-attr="stop-screen-recording"
            size="sm"
            variant="tertiary"
          >
            {t('stop.button')}
          </Button>
        </>
      ) : (
        <>
          {statuses.isStopping ? (
            <>
              <H lvl={3} margin={false}>
                {t('stopping.heading')}
              </H>
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
                {t('stopping.body')}
              </Text>
              <Spinner />
            </>
          ) : (
            <>
              <H lvl={3} margin={false}>
                {t('start.heading')}
              </H>
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
                data-attr="start-screen-recording"
                size="sm"
                variant="tertiary"
              >
                {statuses.isStarting ? (
                  <>
                    <Spinner size={20} />
                    {t('start.loading')}
                  </>
                ) : (
                  t('start.button')
                )}
              </Button>
            </>
          )}
        </>
      )}
    </Div>
  )
}
