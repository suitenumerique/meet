import { A, Button, Div, H, LinkButton, Text } from '@/primitives'

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
} from '../index'
import { useEffect, useMemo, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import {
  BETA_USERS_FORM_URL,
  CRISP_HELP_ARTICLE_TRANSCRIPT,
} from '@/utils/constants'
import { FeatureFlags } from '@/features/analytics/enums'
import {
  NotificationType,
  useNotifyParticipants,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useSnapshot } from 'valtio/index'

export const TranscriptSidePanel = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation('rooms', { keyPrefix: 'transcript' })

  const recordingSnap = useSnapshot(recordingStore)

  const { notifyParticipants } = useNotifyParticipants()

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )
  const roomId = useRoomId()

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { mutateAsync: stopRecordingRoom } = useStopRecording()

  const statuses = useMemo(() => {
    return {
      isAnotherModeStarted:
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTED,
      isStarted: recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTED,
      isStopping: recordingSnap.status == RecordingStatus.TRANSCRIPT_STOPPING,
    }
  }, [recordingSnap])

  const isRecordingTransitioning = useIsRecordingTransitioning()

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
        src={thirdSlide}
        alt={''}
        className={css({
          minHeight: '309px',
          marginBottom: '1rem',
        })}
      />
      {!hasTranscriptAccess ? (
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
            <A href={CRISP_HELP_ARTICLE_TRANSCRIPT} target="_blank">
              {t('start.linkMore')}
            </A>
          </Text>
          <LinkButton
            size="sm"
            variant="tertiary"
            href={BETA_USERS_FORM_URL}
            target="_blank"
          >
            {t('beta.button')}
          </LinkButton>
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
                    <A href={CRISP_HELP_ARTICLE_TRANSCRIPT} target="_blank">
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
            </>
          )}
        </>
      )}
    </Div>
  )
}
