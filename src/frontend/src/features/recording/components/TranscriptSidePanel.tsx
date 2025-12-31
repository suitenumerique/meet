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
} from '../index'
import { useEffect, useMemo, useState } from 'react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import {
  RecordingLanguage,
  RecordingStatus,
  recordingStore,
} from '@/stores/recording'
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
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'
import { HStack, VStack } from '@/styled-system/jsx'
import { Checkbox } from '@/primitives/Checkbox.tsx'

import {
  useSettingsDialog,
  SettingsDialogExtendedKey,
  useTranscriptionLanguageOptions,
} from '@/features/settings'
import { NoAccessView } from './NoAccessView'

export const TranscriptSidePanel = () => {
  const { data } = useConfig()

  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation('rooms', { keyPrefix: 'transcript' })

  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState('')
  const [includeScreenRecording, setIncludeScreenRecording] = useState(false)

  const recordingSnap = useSnapshot(recordingStore)

  const { notifyParticipants } = useNotifyParticipants()
  const languageOptions = useTranscriptionLanguageOptions()

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

  const statuses = useMemo(() => {
    return {
      isAnotherModeStarted:
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTED,
      isStarting: recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTING,
      isStarted: recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTED,
      isStopping: recordingSnap.status == RecordingStatus.TRANSCRIPT_STOPPING,
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

  const handleTranscript = async () => {
    if (!roomId) {
      console.warn('No room ID found')
      return
    }
    try {
      setIsLoading(true)
      if (room.isRecording) {
        await stopRecordingRoom({ id: roomId })
        setIncludeScreenRecording(false)
        recordingStore.status = RecordingStatus.TRANSCRIPT_STOPPING
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
          ...(recordingSnap.language != RecordingLanguage.AUTOMATIC && {
            language: recordingSnap.language,
          }),
          ...(includeScreenRecording && { transcribe: true }),
        }

        await startRecordingRoom({
          id: roomId,
          mode: recordingMode,
          options: recordingOptions,
        })
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

  if (hasFeatureWithoutAdminRights) {
    return (
      <NoAccessView
        i18nKeyPrefix="transcript"
        i18nKey="notAdminOrOwner"
        helpArticle={data?.support?.help_article_transcript}
        imagePath="/assets/intro-slider/3.png"
      />
    )
  }

  if (!hasTranscriptAccess) {
    return (
      <NoAccessView
        i18nKeyPrefix="transcript"
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
          {data?.recording?.max_duration
            ? t('body', {
                max_duration: humanizeDuration(data?.recording?.max_duration, {
                  language: i18n.language,
                }),
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
        <div
          className={css({
            width: '100%',
            // border: '1px solid black',
            background: 'gray.100',
            borderRadius: '4px 4px 0 0',
            paddingLeft: '4px',
            padding: '8px',
            display: 'flex',
          })}
        >
          <div
            className={css({
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <span className="material-icons">article</span>
          </div>
          <div
            className={css({
              flex: 5,
            })}
          >
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
          </div>
        </div>
        <div
          className={css({
            width: '100%',
            // border: '1px solid black',
            background: 'gray.100',
            paddingLeft: '4px',
            padding: '8px',
            display: 'flex',
            marginTop: '4px',
          })}
        >
          <div
            className={css({
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <span className="material-icons">mail</span>
          </div>
          <div
            className={css({
              flex: 5,
            })}
          >
            <Text variant="sm">{t('details.receiver')}</Text>
          </div>
        </div>
        <div
          className={css({
            width: '100%',
            background: 'gray.100',
            borderRadius: '0 0 4px 4px',
            paddingLeft: '4px',
            padding: '8px',
            display: 'flex',
            marginTop: '4px',
          })}
        >
          <div
            className={css({
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <span className="material-icons">language</span>
          </div>
          <div
            className={css({
              flex: 5,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            })}
          >
            <Text variant="sm">{t('details.language')}</Text>
            <Text variant="sm">
              <Button
                variant="text"
                size="xs"
                onPress={() =>
                  openSettingsDialog(SettingsDialogExtendedKey.TRANSCRIPTION)
                }
              >
                {
                  languageOptions.find(
                    (option) => option.key == recordingSnap.language
                  )?.label
                }
              </Button>
            </Text>
          </div>
        </div>

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
            isDisabled={
              statuses.isStarting || statuses.isStarted || isPendingToStart
            }
          >
            <Text variant="sm">{t('details.recording')}</Text>
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
                onPress={() => handleTranscript()}
                isDisabled={statuses.isStopping || isPendingToStop || isLoading}
                data-attr="stop-transcript"
              >
                {t('button.stop')}
              </Button>
            ) : (
              <Button
                variant="tertiary"
                fullWidth
                onPress={() => handleTranscript()}
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
