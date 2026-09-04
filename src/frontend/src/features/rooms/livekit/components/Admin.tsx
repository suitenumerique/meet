import { Div, Field, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useAccessLevelItems } from '@/features/rooms/hooks/useAccessLevelItems'
import { keys } from '@/api/queryKeys'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'wouter'
import { usePublishSourcesManager } from '../hooks/usePublishSourcesManager'
import { usePermissionsManager } from '../hooks/usePermissionsManager'
import { useEffect } from 'react'
import { closeSidePanel } from '@/stores/layout'
import { useIsAdminOrOwner } from '../hooks/useIsAdminOrOwner'
import { reportError } from '@/features/analytics/telemetry'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })
  const accessLevelItems = useAccessLevelItems()

  const { roomId } = useParams()

  if (!roomId) {
    throw new Error()
  }

  const { mutateAsync: patchRoom } = usePatchRoom()

  const isAdminOrOwner = useIsAdminOrOwner()

  useEffect(() => {
    if (!isAdminOrOwner) {
      closeSidePanel()
    }
  }, [isAdminOrOwner])

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

  const { toggleMuting, isMutingEnabled } = usePermissionsManager()

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
          <Field
            type="switch"
            label={t('moderation.mute.label')}
            description={t('moderation.mute.description')}
            isSelected={isMutingEnabled}
            onChange={toggleMuting}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
        </div>
      </div>
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
          value={
            readOnlyData?.access_level_overridden
              ? null
              : readOnlyData?.access_level
          }
          onChange={(value) =>
            patchRoom({
              roomId,
              room: { access_level: value as ApiAccessLevel },
            }).catch((e) => reportError('generic_failure', e))
          }
          items={accessLevelItems}
        />
        {readOnlyData?.access_level_overridden && (
          <Text
            role="status"
            variant="warning"
            wrap="pretty"
            className={css({ textStyle: 'sm' })}
            margin={'md'}
          >
            {t('access.enforced', {
              level: t(`access.levels.${readOnlyData.access_level}.label`),
            })}
          </Text>
        )}
      </div>
    </Div>
  )
}
