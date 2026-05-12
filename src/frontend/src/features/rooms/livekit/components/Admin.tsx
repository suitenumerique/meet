import { Div, Field, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useRecordingStatuses } from '@/features/recording'
import { RecordingMode } from '@/features/recording'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'wouter'
import { usePublishSourcesManager } from '@/features/rooms/livekit/hooks/usePublishSourcesManager'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  const { roomId } = useParams()

  if (!roomId) {
    throw new Error()
  }

  const { mutateAsync: patchRoom } = usePatchRoom()

  const { data: readOnlyData } = useQuery({
    queryKey: [keys.room, roomId],
    queryFn: () => fetchRoom({ roomId }),
    retry: false,
    enabled: false,
  })

  const {
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = usePublishSourcesManager()

  // Reasons we block the admin from re-enabling encryption mid-call:
  //   - a recording is in progress (the recording server needs plaintext)
  //   - a transcript is being captured (same reason)
  // SIP participants aren't a blocker — re-enabling encryption while
  // they're present moves them back into placeholder mode, and the admin
  // will see the snackbar.
  //
  // We use `isStarted` from useRecordingStatuses (metadata-driven) rather
  // than LK's `useIsRecording`. The metadata transitions through Saving
  // immediately when the user clicks stop, so the alert clears right
  // away rather than after the 1–2s LK round-trip.
  const screenRec = useRecordingStatuses(RecordingMode.ScreenRecording)
  const transcript = useRecordingStatuses(RecordingMode.Transcript)
  const resumeBlockedReason = screenRec.isStarted
    ? t('encryption.blocked.recording')
    : transcript.isStarted
      ? t('encryption.blocked.transcript')
      : null

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <Text
        variant="note"
        wrap="pretty"
        className={css({
          textStyle: 'sm',
        })}
        margin={'md'}
      >
        {t('description')}
      </Text>
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        <RACSeparator
          className={css({
            border: 'none',
            height: '1px',
            width: '100%',
            background: 'greyscale.250',
          })}
        />
        <H
          lvl={2}
          className={css({
            fontWeight: 500,
          })}
          margin="sm"
        >
          {t('moderation.title')}
        </H>
        <Text
          variant="note"
          wrap="balance"
          className={css({
            textStyle: 'sm',
          })}
          margin={'md'}
        >
          {t('moderation.description')}
        </Text>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          })}
        >
          <Field
            type="switch"
            label={t('moderation.microphone.label')}
            description={t('moderation.microphone.description')}
            isSelected={isMicrophoneEnabled}
            onChange={toggleMicrophone}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
          <Field
            type="switch"
            label={t('moderation.camera.label')}
            description={t('moderation.camera.description')}
            isSelected={isCameraEnabled}
            onChange={toggleCamera}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
          <Field
            type="switch"
            label={t('moderation.screenshare.label')}
            description={t('moderation.screenshare.description')}
            isSelected={isScreenShareEnabled}
            onChange={toggleScreenShare}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
        </div>
      </div>
      {readOnlyData?.is_encrypted && (
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            marginTop: '1rem',
            width: '100%',
          })}
        >
          <RACSeparator
            className={css({
              border: 'none',
              height: '1px',
              width: '100%',
              background: 'greyscale.250',
            })}
          />
          <H
            lvl={2}
            className={css({
              fontWeight: 500,
            })}
            margin="sm"
          >
            {t('encryption.title')}
          </H>
          <Text
            variant="note"
            wrap="balance"
            className={css({
              textStyle: 'sm',
            })}
            margin={'md'}
          >
            {t('encryption.description')}
          </Text>
          {(() => {
            const resumeBlocked =
              !!readOnlyData?.encryption_paused && resumeBlockedReason != null
            return (
              <>
                <div
                  className={css({
                    opacity: resumeBlocked ? 0.45 : 1,
                    pointerEvents: resumeBlocked ? 'none' : undefined,
                    transition: 'opacity 200ms ease',
                  })}
                  aria-disabled={resumeBlocked || undefined}
                >
                  <Field
                    type="switch"
                    label={t('encryption.toggle.label')}
                    description={
                      readOnlyData?.encryption_paused
                        ? t('encryption.toggle.descriptionPaused')
                        : t('encryption.toggle.descriptionLive')
                    }
                    isSelected={!!readOnlyData?.encryption_paused}
                    isDisabled={resumeBlocked}
                    onChange={(paused) =>
                      patchRoom({
                        roomId,
                        room: { encryption_paused: paused },
                      })
                        .then((room) => {
                          queryClient.setQueryData([keys.room, roomId], room)
                        })
                        .catch((e) => console.error(e))
                    }
                    wrapperProps={{
                      noMargin: true,
                      fullWidth: true,
                    }}
                  />
                </div>
                {resumeBlocked && (
                  <div
                    role="alert"
                    className={css({
                      display: 'flex',
                      gap: '0.5rem',
                      marginTop: '0.75rem',
                      padding: '0.7rem 0.85rem',
                      borderRadius: '0.5rem',
                      backgroundColor: '#fff7ed',
                      border: '1px solid #fed7aa',
                      color: '#7c2d12',
                    })}
                  >
                    <span
                      aria-hidden
                      className={css({
                        fontSize: '1rem',
                        lineHeight: '1.2',
                      })}
                    >
                      ⚠
                    </span>
                    <Text
                      variant="sm"
                      margin={false}
                      className={css({
                        color: '#7c2d12',
                        fontSize: '0.85rem',
                        lineHeight: 1.4,
                      })}
                    >
                      {resumeBlockedReason}
                    </Text>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1rem',
        })}
      >
        <RACSeparator
          className={css({
            border: 'none',
            height: '1px',
            width: '100%',
            background: 'greyscale.250',
          })}
        />
        <H
          lvl={2}
          className={css({
            fontWeight: 500,
          })}
          margin="sm"
        >
          {t('access.title')}
        </H>
        <Text
          variant="note"
          wrap="balance"
          className={css({
            textStyle: 'sm',
          })}
          margin={'md'}
        >
          {t('access.description')}
        </Text>
        <Field
          type="radioGroup"
          label={t('access.type')}
          aria-label={t('access.type')}
          labelProps={{
            className: css({
              fontSize: '1rem',
              paddingBottom: '1rem',
            }),
          }}
          value={readOnlyData?.access_level}
          onChange={(value) =>
            patchRoom({
              roomId,
              room: { access_level: value as ApiAccessLevel },
            })
              .then((room) => {
                queryClient.setQueryData([keys.room, roomId], room)
              })
              .catch((e) => console.error(e))
          }
          items={[
            {
              value: ApiAccessLevel.PUBLIC,
              label: t('access.levels.public.label'),
              description: t('access.levels.public.description'),
            },
            {
              value: ApiAccessLevel.TRUSTED,
              label: t('access.levels.trusted.label'),
              description: t('access.levels.trusted.description'),
            },
            {
              value: ApiAccessLevel.RESTRICTED,
              label: t('access.levels.restricted.label'),
              description: t('access.levels.restricted.description'),
            },
          ]}
        />
      </div>
    </Div>
  )
}
