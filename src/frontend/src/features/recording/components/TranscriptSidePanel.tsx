import { A, Button, Dialog, Div, H, LinkButton, P, Text } from '@/primitives'

import thirdSlide from '@/assets/intro-slider/3_resume.png'
import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useHasRecordingAccess,
  useIsRecordingTransitioning,
  useStartRecording,
  useStopRecording,
  useHasFeatureWithoutAdminRights,
} from '../index'
import { useEffect, useMemo, useState } from 'react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import {
  NotificationType,
  useNotifyParticipants,
  notifyRecordingSaveInProgress,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useSnapshot } from 'valtio/index'
import { Spinner } from '@/primitives/Spinner'
import { useConfig } from '@/api/useConfig'

export const TranscriptSidePanel = () => {
  const { data } = useConfig()

  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation('rooms', { keyPrefix: 'transcript' })

  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState('')

  const recordingSnap = useSnapshot(recordingStore)

  const { notifyParticipants } = useNotifyParticipants()

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const hasFeatureWithoutAdminRights = useHasFeatureWithoutAdminRights(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

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
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTED,
      isStarting: recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTING,
      isStarted: recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTED,
      isStopping: recordingSnap.status == RecordingStatus.TRANSCRIPT_STOPPING,
    }
  }, [recordingSnap])

  const isRecordingTransitioning = useIsRecordingTransitioning()

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

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      setIsLoading(true)
      if (room.isRecording) {
        await stopRecordingRoom({ id: roomId })
        recordingStore.status = RecordingStatus.TRANSCRIPT_STOPPING
        await notifyParticipants({
          type: NotificationType.TranscriptionStopped,
        })
        notifyRecordingSaveInProgress(
          RecordingMode.Transcript,
          room.localParticipant
        )
      } else {
        await startRecordingRoom({ id: roomId, mode: RecordingMode.Transcript })
        recordingStore.status = RecordingStatus.TRANSCRIPT_STARTING
        await notifyParticipants({
          type: NotificationType.TranscriptionStarted,
        })
        posthog.capture('transcript-started', {})
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
        src={thirdSlide}
        alt={''}
        className={css({
          minHeight: '309px',
          marginBottom: '1rem',
        })}
      />
      {!hasTranscriptAccess ? (
        <>
          {hasFeatureWithoutAdminRights ? (
            <>
              <Text>{t('notAdminOrOwner.heading')}</Text>
              <Text
                variant="note"
                wrap="balance"
                centered
                className={css({
                  textStyle: 'sm',
                  marginBottom: '2.5rem',
                  marginTop: '0.25rem',
                })}
              >
                {t('notAdminOrOwner.body')}
                <br />
                {data?.support?.help_article_transcript && (
                  <A
                    href={data.support.help_article_transcript}
                    target="_blank"
                  >
                    {t('notAdminOrOwner.linkMore')}
                  </A>
                )}
              </Text>
            </>
          ) : (
            <>
              <Text>{t('beta.heading')}</Text>
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
                {t('beta.body')}{' '}
                {data?.support?.help_article_transcript && (
                  <A
                    href={data.support.help_article_transcript}
                    target="_blank"
                  >
                    {t('start.linkMore')}
                  </A>
                )}
              </Text>
              {data?.transcript.form_beta_users && (
                <LinkButton
                  size="sm"
                  variant="tertiary"
                  href={data?.transcript.form_beta_users}
                  target="_blank"
                >
                  {t('beta.button')}
                </LinkButton>
              )}
            </>
          )}
        </>
      ) : (
        <>
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
                    {data?.support?.help_article_transcript && (
                      <A
                        href={data.support.help_article_transcript}
                        target="_blank"
                      >
                        {t('start.linkMore')}
                      </A>
                    )}
                  </Text>
                  <Button
                    isDisabled={isDisabled}
                    onPress={() => handleTranscript()}
                    data-attr="start-transcript"
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
