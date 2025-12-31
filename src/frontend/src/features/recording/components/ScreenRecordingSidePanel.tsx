import { A, Button, Dialog, Div, H, P, Text } from '@/primitives'

import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useHasFeatureWithoutAdminRights,
  useStartRecording,
  useStopRecording,
  useHumanizeRecordingMaxDuration,
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
import { FeatureFlags } from '@/features/analytics/enums'
import { NoAccessView } from './NoAccessView'
import { HStack, VStack } from '@/styled-system/jsx'
import { RowWrapper } from './RowWrapper'
import { Checkbox } from '@/primitives/Checkbox'
import { useTranscriptionLanguage } from '@/features/settings'

export const ScreenRecordingSidePanel = () => {
  const { data } = useConfig()
  const recordingMaxDuration = useHumanizeRecordingMaxDuration()

  const [isLoading, setIsLoading] = useState(false)
  const recordingSnap = useSnapshot(recordingStore)
  const { t } = useTranslation('rooms', { keyPrefix: 'screenRecording' })

  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState('')

  const [includeTranscript, setIncludeTranscript] = useState(false)

  const hasFeatureWithoutAdminRights = useHasFeatureWithoutAdminRights(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  const { notifyParticipants } = useNotifyParticipants()
  const { selectedLanguageKey, isLanguageSetToAuto } =
    useTranscriptionLanguage()

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
        setIncludeTranscript(false)
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
        const recordingOptions = {
          ...(!isLanguageSetToAuto && {
            language: selectedLanguageKey,
          }),
          ...(includeTranscript && { transcribe: true }),
        }

        await startRecordingRoom({
          id: roomId,
          mode: RecordingMode.ScreenRecording,
          options: recordingOptions,
        })
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTING
        await notifyParticipants({
          type: NotificationType.ScreenRecordingStarted,
        })
        posthog.capture('screen-recording-started', {})
      }
    } catch (error) {
      console.error('Failed to handle recording:', error)
      setIsLoading(false)
    }
  }

  if (hasFeatureWithoutAdminRights) {
    return (
      <NoAccessView
        i18nKeyPrefix="screenRecording"
        i18nKey="notAdminOrOwner"
        helpArticle={data?.support?.help_article_recording}
        imagePath="/assets/intro-slider/4.png"
      />
    )
  }

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
        alt=""
        className={css({
          minHeight: '250px',
          height: '250px',
          marginBottom: '1rem',
          marginTop: '-16px',
          '@media (max-height: 900px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '25%',
            marginBottom: '0.75rem',
          },
          '@media (max-height: 770px)': {
            display: 'none',
          },
        })}
      />
      <VStack gap={0} marginBottom={30}>
        <H lvl={1} margin={'sm'} fullWidth>
          {t('heading')}
        </H>
        <Text variant="body" fullWidth>
          {recordingMaxDuration
            ? t('body', {
                max_duration: recordingMaxDuration,
              })
            : t('bodyWithoutMaxDuration')}{' '}
          {data?.support?.help_article_recording && (
            <A href={data.support.help_article_recording} target="_blank">
              {t('linkMore')}
            </A>
          )}
        </Text>
      </VStack>
      <VStack gap={0} marginBottom={40}>
        <RowWrapper iconName="cloud_download" position="first">
          <Text variant="sm">{t('details.destination')}</Text>
        </RowWrapper>
        <RowWrapper iconName="mail" position="last">
          <Text variant="sm">{t('details.receiver')}</Text>
        </RowWrapper>

        <div className={css({ height: '15px' })} />

        <div
          className={css({
            width: '100%',
            marginLeft: '20px',
          })}
        >
          <Checkbox
            size="sm"
            isSelected={includeTranscript}
            onChange={setIncludeTranscript}
            isDisabled={
              statuses.isStarting || statuses.isStarted || isPendingToStart
            }
          >
            <Text variant="sm">{t('details.transcription')}</Text>
          </Checkbox>
        </div>
      </VStack>
      <div
        className={css({
          marginBottom: '80px',
          width: '100%',
        })}
      >
        {statuses.isStopping || isPendingToStop ? (
          <HStack width={'100%'} height={'46px'} justify="center">
            <Spinner size={30} />
            <Text variant="body">{t('button.saving')}</Text>
          </HStack>
        ) : (
          <>
            {statuses.isStarted || statuses.isStarting || room.isRecording ? (
              <Button
                variant="tertiary"
                fullWidth
                onPress={() => handleScreenRecording()}
                isDisabled={statuses.isStopping || isPendingToStop || isLoading}
                data-attr="stop-transcript"
              >
                {t('button.stop')}
              </Button>
            ) : (
              <Button
                variant="tertiary"
                fullWidth
                onPress={() => handleScreenRecording()}
                isDisabled={isPendingToStart || !isRoomConnected || isLoading}
                data-attr="start-transcript"
              >
                {t('button.start')}
              </Button>
            )}
          </>
        )}
      </div>
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
