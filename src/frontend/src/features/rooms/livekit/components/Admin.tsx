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
import { useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useSidePanelRef } from '../hooks/useSidePanelRef'
import { useSidePanelTriggers } from '../hooks/useSidePanelTriggers'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })
  const { isAdminOpen } = useSidePanel()
  const panelRef = useSidePanelRef()
  const { getTrigger } = useSidePanelTriggers()

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

  // Restore focus to the element that opened the Admin panel
  useRestoreFocus(isAdminOpen, {
    resolveTrigger: (activeEl) => {
      return getTrigger('admin') ?? activeEl
    },
    // Focus the first focusable element when the panel opens (first Field switch)
    onOpened: () => {
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (panel) {
          // Find the first switch in the moderation section
          const firstSwitch =
            panel.querySelector<HTMLElement>('[role="switch"]')
          if (firstSwitch) {
            firstSwitch.focus({ preventScroll: true })
          }
        }
      })
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

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
