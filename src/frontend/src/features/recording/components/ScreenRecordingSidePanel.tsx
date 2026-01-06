import { A, Div, H, Text } from '@/primitives'

import { css } from '@/styled-system/css'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { useRoomContext } from '@livekit/components-react'
import {
  RecordingMode,
  useHasFeatureWithoutAdminRights,
  useHumanizeRecordingMaxDuration,
  useRecordingStatuses,
} from '@/features/recording'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  NotificationType,
  notifyRecordingSaveInProgress,
  useNotifyParticipants,
} from '@/features/notifications'
import posthog from 'posthog-js'
import { useConfig } from '@/api/useConfig'
import { FeatureFlags } from '@/features/analytics/enums'
import { NoAccessView } from './NoAccessView'
import { ControlsButton } from './ControlsButton'
import { RowWrapper } from './RowWrapper'
import { VStack } from '@/styled-system/jsx'
import { Checkbox } from '@/primitives/Checkbox'
import { useTranscriptionLanguage } from '@/features/settings'
import { useMutateRecording } from '../hooks/useMutateRecording'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'

export const ScreenRecordingSidePanel = () => {
  const { data } = useConfig()
  const recordingMaxDuration = useHumanizeRecordingMaxDuration()

  const keyPrefix = 'screenRecording'
  const { t } = useTranslation('rooms', { keyPrefix })

  const [includeTranscript, setIncludeTranscript] = useState(false)

  const hasFeatureWithoutAdminRights = useHasFeatureWithoutAdminRights(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  const { notifyParticipants } = useNotifyParticipants()
  const { selectedLanguageKey, isLanguageSetToAuto } =
    useTranscriptionLanguage()

  const roomId = useRoomId()

  const { startRecording, isPendingToStart, stopRecording, isPendingToStop } =
    useMutateRecording()

  const statuses = useRecordingStatuses(RecordingMode.ScreenRecording)

  const room = useRoomContext()
  const { openTranscript } = useSidePanel()

  const handleRequestScreenRecording = async () => {
    await notifyParticipants({
      type: NotificationType.ScreenRecordingRequested,
    })
    posthog.capture('screen-recording-requested', {})
  }

  const handleScreenRecording = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      if (statuses.isStarted || statuses.isStarting) {
        setIncludeTranscript(false)
        await stopRecording({ id: roomId })

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

        await startRecording({
          id: roomId,
          mode: RecordingMode.ScreenRecording,
          options: recordingOptions,
        })

        await notifyParticipants({
          type: NotificationType.ScreenRecordingStarted,
        })
        posthog.capture('screen-recording-started', {
          includeTranscript: includeTranscript,
          language: selectedLanguageKey,
        })
      }
    } catch (error) {
      console.error('Failed to handle recording:', error)
    }
  }

  if (hasFeatureWithoutAdminRights) {
    return (
      <NoAccessView
        i18nKeyPrefix={keyPrefix}
        i18nKey="notAdminOrOwner"
        helpArticle={data?.support?.help_article_recording}
        imagePath="/assets/intro-slider/4.png"
        handleRequest={handleRequestScreenRecording}
        isActive={statuses.isActive}
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
            isDisabled={statuses.isActive || isPendingToStart}
          >
            <Text variant="sm">{t('details.transcription')}</Text>
          </Checkbox>
        </div>
      </VStack>
      <ControlsButton
        i18nKeyPrefix={keyPrefix}
        handle={handleScreenRecording}
        statuses={statuses}
        isPendingToStart={isPendingToStart}
        isPendingToStop={isPendingToStop}
        openSidePanel={openTranscript}
      />
    </Div>
  )
}
