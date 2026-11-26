import { Div, Field, Text } from '@/primitives'
import { css, cx } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useParams } from 'wouter'
import { usePublishSourcesManager } from '../hooks/usePublishSourcesManager'
import { usePermissionsManager } from '../hooks/usePermissionsManager'
import { useRoomData } from '../hooks/useRoomData'
import { type ReactNode, useEffect } from 'react'
import { closeSidePanel } from '@/stores/layout'
import { useIsAdminOrOwner } from '../hooks/useIsAdminOrOwner'
import { reportError } from '@/features/analytics/telemetry'
import { sidePanelScrollArea } from '@/features/rooms/livekit/components/sidePanelScrollArea'

const Section = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <section className={css({ paddingBottom: '1.5rem' })}>
    <RACSeparator
      className={css({
        border: 'none',
        height: '1px',
        marginLeft: '-1.5rem',
        marginRight: 'calc(10px - 1.5rem)',
        marginBottom: '1.5rem',
        background: 'border.surface.primary',
      })}
    />
    <Text
      as="h2"
      margin={false}
      className={css({
        textStyle: 'h3',
        fontWeight: 'bold',
        lineHeight: '1.5rem',
      })}
    >
      {title}
    </Text>
    <Text
      variant="smNote"
      wrap="pretty"
      margin={false}
      className={css({ paddingTop: '0.25rem', paddingBottom: '1rem' })}
    >
      {description}
    </Text>
    {children}
  </section>
)

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

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

  // Read the cached room only: an observer with its own queryFn could serve
  // the refetch that follows a setting change with a GET, which returns no
  // LiveKit credentials
  const readOnlyData = useRoomData()

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
      flexGrow={1}
      flexDirection="column"
      minHeight={0}
      overflow="hidden"
    >
      {/* Stays in place while the sections scroll under it. */}
      <div className={css({ flexShrink: 0 })}>
        <Text
          variant="smNote"
          wrap="pretty"
          margin={false}
          className={css({
            paddingInline: '1.5rem',
            // leaves the room to the settings on short screens
            '@media (max-height: 770px)': {
              display: 'none',
            },
          })}
        >
          {t('description')}
        </Text>
      </div>
      <div
        className={cx(
          sidePanelScrollArea(),
          css({
            flexGrow: 1,
            minHeight: 0,
            paddingTop: '1rem',
          })
        )}
      >
        <Section
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
        </Section>
        <Section
          title={t('access.title')}
          description={t('access.description')}
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
              }).catch((e) => reportError('generic_failure', e))
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
        </Section>
      </div>
    </Div>
  )
}
