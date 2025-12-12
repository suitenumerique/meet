import { A, Button, Dialog, Div, H, P, Text } from '@/primitives'

import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useIsRecordingTransitioning,
  useStartRecording,
  useStopRecording,
} from '@/features/recording'
import { useEffect, useMemo, useState } from 'react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RecordingStatus, recordingStore } from '@/stores/recording'

import {
  NotificationType,
  notifyRecordingSaveInProgress,
  useNotifyParticipants,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useSnapshot } from 'valtio/index'
import { Spinner } from '@/primitives/Spinner'
import { useConfig } from '@/api/useConfig'
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'

export const ScreenRecordingSidePanel = () => {
  const { data } = useConfig()
  const [isLoading, setIsLoading] = useState(false)
  const recordingSnap = useSnapshot(recordingStore)
  const { t } = useTranslation('rooms', { keyPrefix: 'screenRecording' })

  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState('')

  const { notifyParticipants } = useNotifyParticipants()

  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom, isPending: isPendingToStart } =
    useStartRecording({
      onError: () => setIsErrorDialogOpen('start'),
    })
  const { mutateAsync: stopRecordingRoom, isPending: isPendingToStop } =
    useStopRecording({
      onError: () => setIsErrorDialogOpen('stop'),
    })

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
  const isRoomConnected = room.state == ConnectionState.Connected
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
        notifyRecordingSaveInProgress(
          RecordingMode.ScreenRecording,
          room.localParticipant
        )
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
      isLoading ||
      isRecordingTransitioning ||
      statuses.isAnotherModeStarted ||
      !isRoomConnected,
    [isLoading, isRecordingTransitioning, statuses, isRoomConnected]
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
        src="/assets/intro-slider/4.png"
        alt={''}
        className={css({
          minHeight: '309px',
          height: '309px',
          marginBottom: '1rem',
          '@media (max-height: 700px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '45%',
            marginBottom: '0.3rem',
          },
          '@media (max-height: 530px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '40%',
            marginBottom: '0.1rem',
          },
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
              '@media (max-height: 700px)': {
                marginBottom: '1rem',
              },
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
          {statuses.isStopping || isPendingToStop ? (
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
                  '@media (max-height: 700px)': {
                    marginBottom: '1rem',
                  },
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
                wrap="balance"
                centered
                className={css({
                  textStyle: 'sm',
                  maxWidth: '90%',
                  marginBottom: '2.5rem',
                  marginTop: '0.25rem',
                  '@media (max-height: 700px)': {
                    marginBottom: '1rem',
                  },
                })}
              >
                {t('start.body', {
                  duration_message: data?.recording?.max_duration
                    ? t('durationMessage', {
                        max_duration: humanizeDuration(
                          data?.recording?.max_duration,
                          {
                            language: i18n.language,
                          }
                        ),
                      })
                    : '',
                })}{' '}
                {data?.support?.help_article_recording && (
                  <A href={data.support.help_article_recording} target="_blank">
                    {t('start.linkMore')}
                  </A>
                )}
              </Text>
              <Button
                isDisabled={isDisabled}
                onPress={() => handleScreenRecording()}
                data-attr="start-screen-recording"
                size="sm"
                variant="tertiary"
              >
                {statuses.isStarting || isPendingToStart ? (
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
      <Dialog
        isOpen={!!isErrorDialogOpen}
        role="alertdialog"
        aria-label={t('alert.title')}
      >
        <P>{t(`alert.body.${isErrorDialogOpen}`)}</P>
        <Button
          variant="text"
          size="sm"
          onPress={() => setIsErrorDialogOpen('')}
        >
          {t('alert.button')}
        </Button>
      </Dialog>
    </Div>
  )
}
