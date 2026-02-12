import { Div, Field, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'wouter'
import { usePublishSourcesManager } from '@/features/rooms/livekit/hooks/usePublishSourcesManager'
import { RecordingMode, RecordingPermission } from '@/features/recording/types'
import { useIsRecordingModeEnabled } from '@/features/recording/hooks/useIsRecordingModeEnabled'
import {
  NotificationType,
  useNotifyParticipants,
} from '@/features/notifications'

interface AdminSectionProps {
  title: string
  description: string
  children: React.ReactNode
  marginTop?: string
}

const AdminSection = ({
  title,
  description,
  children,
  marginTop,
}: AdminSectionProps) => (
  <div
    className={css({
      display: 'flex',
      flexDirection: 'column',
      ...(marginTop && { marginTop }),
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
      {title}
    </H>
    <Text
      variant="note"
      wrap="balance"
      className={css({
        textStyle: 'sm',
      })}
      margin={'md'}
    >
      {description}
    </Text>
    {children}
  </div>
)

interface RecordingPermissionFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

const RecordingPermissionField = ({
  label,
  value,
  onChange,
}: RecordingPermissionFieldProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  return (
    <Field
      type="radioGroup"
      label={label}
      aria-label={label}
      labelProps={{
        className: css({
          fontSize: '1rem',
          paddingBottom: '1rem',
        }),
      }}
      value={value}
      onChange={onChange}
      items={[
        {
          value: RecordingPermission.AdminOwner,
          label: t('recording.levels.adminOwner.label'),
          description: t('recording.levels.adminOwner.description'),
        },
        {
          value: RecordingPermission.Authenticated,
          label: t('recording.levels.authenticated.label'),
          description: t('recording.levels.authenticated.description'),
        },
      ]}
    />
  )
}

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

  const { notifyParticipants } = useNotifyParticipants()

  const handleRecordingPermissionChange =
    (configKey: 'screen_recording_permission' | 'transcript_permission') =>
    (value: string) =>
      patchRoom({
        roomId,
        room: {
          configuration: {
            ...readOnlyData?.configuration,
            [configKey]: value,
          },
        },
      })
        .then((room) => {
          queryClient.setQueryData([keys.room, roomId], room)
          notifyParticipants({
            type: NotificationType.RecordingPermissionsChanged,
          })
        })
        .catch((e) => console.error(e))

  const isScreenRecordingEnabled = useIsRecordingModeEnabled(
    RecordingMode.ScreenRecording
  )
  const isTranscriptEnabled = useIsRecordingModeEnabled(
    RecordingMode.Transcript
  )

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
      <AdminSection
        title={t('moderation.title')}
        description={t('moderation.description')}
      >
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
      </AdminSection>
      <AdminSection
        title={t('access.title')}
        description={t('access.description')}
        marginTop="1rem"
      >
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
      </AdminSection>
      {(isScreenRecordingEnabled || isTranscriptEnabled) && (
        <AdminSection
          title={t('recording.title')}
          description={t('recording.description')}
          marginTop="1rem"
        >
          {isScreenRecordingEnabled && (
            <RecordingPermissionField
              label={t('recording.screenRecording.label')}
              value={
                readOnlyData?.recording_permissions
                  ?.screen_recording_permission ??
                RecordingPermission.AdminOwner
              }
              onChange={handleRecordingPermissionChange(
                'screen_recording_permission'
              )}
            />
          )}
          {isTranscriptEnabled && (
            <RecordingPermissionField
              label={t('recording.transcript.label')}
              value={
                readOnlyData?.recording_permissions?.transcript_permission ??
                RecordingPermission.AdminOwner
              }
              onChange={handleRecordingPermissionChange('transcript_permission')}
            />
          )}
        </AdminSection>
      )}
    </Div>
  )
}
