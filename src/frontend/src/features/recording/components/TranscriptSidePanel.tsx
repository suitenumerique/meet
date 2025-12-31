import { A, Button, Dialog, Div, H, P, Text } from '@/primitives'

import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useHasRecordingAccess,
  useStartRecording,
  useStopRecording,
  useHasFeatureWithoutAdminRights,
  useHumanizeRecordingMaxDuration,
  useRecordingStatuses,
} from '../index'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FeatureFlags } from '@/features/analytics/enums'
import {
  NotificationType,
  useNotifyParticipants,
  notifyRecordingSaveInProgress,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useConfig } from '@/api/useConfig'
import { VStack } from '@/styled-system/jsx'
import { Checkbox } from '@/primitives/Checkbox.tsx'

import {
  useSettingsDialog,
  SettingsDialogExtendedKey,
  useTranscriptionLanguage,
} from '@/features/settings'
import { NoAccessView } from './NoAccessView'
import { ControlsButton } from './ControlsButton'
import { RowWrapper } from './RowWrapper'

export const TranscriptSidePanel = () => {
  const { data } = useConfig()
  const recordingMaxDuration = useHumanizeRecordingMaxDuration()

  const keyPrefix = 'transcript'
  const { t } = useTranslation('rooms', { keyPrefix })

  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState('')
  const [includeScreenRecording, setIncludeScreenRecording] = useState(false)

  const { notifyParticipants } = useNotifyParticipants()
  const { selectedLanguageKey, selectedLanguageLabel, isLanguageSetToAuto } =
    useTranscriptionLanguage()

  const { openSettingsDialog } = useSettingsDialog()

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

  const statuses = useRecordingStatuses(RecordingMode.Transcript)

  const room = useRoomContext()

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      if (statuses.isStarted || statuses.isStarting) {
        await stopRecordingRoom({ id: roomId })
        setIncludeScreenRecording(false)

        await notifyParticipants({
          type: NotificationType.TranscriptionStopped,
        })
        notifyRecordingSaveInProgress(
          RecordingMode.Transcript,
          room.localParticipant
        )
      } else {
        const recordingMode = includeScreenRecording
          ? RecordingMode.ScreenRecording
          : RecordingMode.Transcript

        const recordingOptions = {
          ...(!isLanguageSetToAuto && {
            language: selectedLanguageKey,
          }),
          ...(includeScreenRecording && {
            transcribe: true,
            original_mode: RecordingMode.Transcript,
          }),
        }

        await startRecordingRoom({
          id: roomId,
          mode: recordingMode,
          options: recordingOptions,
        })

        await notifyParticipants({
          type: NotificationType.TranscriptionStarted,
        })
        posthog.capture('transcript-started', {})
      }
    } catch (error) {
      console.error('Failed to handle transcript:', error)
    }
  }

  if (hasFeatureWithoutAdminRights) {
    return (
      <NoAccessView
        i18nKeyPrefix={keyPrefix}
        i18nKey="notAdminOrOwner"
        helpArticle={data?.support?.help_article_transcript}
        imagePath="/assets/intro-slider/3.png"
      />
    )
  }

  if (!hasTranscriptAccess) {
    return (
      <NoAccessView
        i18nKeyPrefix={keyPrefix}
        i18nKey="premium"
        helpArticle={data?.support?.help_article_transcript}
        imagePath="/assets/intro-slider/3.png"
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
        src="/assets/intro-slider/3.png"
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
        <H lvl={1} margin={'sm'}>
          {t('heading')}
        </H>
        <Text variant="body" fullWidth>
          {recordingMaxDuration
            ? t('body', {
                max_duration: recordingMaxDuration,
              })
            : t('bodyWithoutMaxDuration')}{' '}
          {data?.support?.help_article_transcript && (
            <A href={data.support.help_article_transcript} target="_blank">
              {t('linkMore')}
            </A>
          )}
        </Text>
      </VStack>
      <VStack gap={0} marginBottom={40}>
        <RowWrapper iconName="article" position="first">
          <Text variant="sm">
            {data?.transcription_destination ? (
              <>
                {t('details.destination')}{' '}
                <A
                  href={data.transcription_destination}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {data.transcription_destination.replace('https://', '')}
                </A>
              </>
            ) : (
              t('details.destinationUnknown')
            )}
          </Text>
        </RowWrapper>
        <RowWrapper iconName="mail">
          <Text variant="sm">{t('details.receiver')}</Text>
        </RowWrapper>
        <RowWrapper iconName="language" position="last">
          <Text variant="sm">{t('details.language')}</Text>
          <Text variant="sm">
            <Button
              variant="text"
              size="xs"
              onPress={() =>
                openSettingsDialog(SettingsDialogExtendedKey.TRANSCRIPTION)
              }
            >
              {selectedLanguageLabel}
            </Button>
          </Text>
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
            isSelected={includeScreenRecording}
            onChange={setIncludeScreenRecording}
            isDisabled={statuses.isActive || isPendingToStart}
          >
            <Text variant="sm">{t('details.recording')}</Text>
          </Checkbox>
        </div>
      </VStack>
      <ControlsButton
        i18nKeyPrefix={keyPrefix}
        handle={handleTranscript}
        statuses={statuses}
        isPendingToStart={isPendingToStart}
        isPendingToStop={isPendingToStop}
      />
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
