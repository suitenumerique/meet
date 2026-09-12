import { useEffect, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'wouter'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Track } from 'livekit-client'
import { css } from '@/styled-system/css'
import { Button, Field, H, Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { keys } from '@/api/queryKeys'
import { useConfig } from '@/api/useConfig'
import { useUser } from '@/features/auth/api/useUser'
import { authUrl } from '@/features/auth/utils/authUrl'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import {
  ApiAccessLevel,
  effectiveAccessLevel,
} from '@/features/rooms/api/ApiRoom'
import { useAccessLevelItems } from '@/features/rooms/hooks/useAccessLevelItems'
import { updatePublishSources } from '@/features/rooms/livekit/hooks/usePublishSourcesManager'
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import { reportError } from '@/features/analytics/telemetry'

type Source = Track.Source

const SectionHeader = ({ children }: { children: ReactNode }) => (
  <div
    className={css({
      backgroundColor: 'greyscale.50',
      borderTopWidth: '1px',
      borderTopStyle: 'solid',
      borderTopColor: 'greyscale.250',
      borderBottomWidth: '1px',
      borderBottomStyle: 'solid',
      borderBottomColor: 'greyscale.250',
      padding: '0.75rem 1.5rem',
    })}
  >
    <H
      lvl={2}
      margin={false}
      className={css({
        fontWeight: 500,
        fontSize: '1.125rem',
      })}
    >
      {children}
    </H>
  </div>
)

const SectionBody = ({ children }: { children: ReactNode }) => (
  <div
    className={css({
      display: 'flex',
      flexDirection: 'column',
      padding: '1rem 1.5rem 1.5rem',
    })}
  >
    {children}
  </div>
)

const SettingsPopup = () => {
  const { t } = useTranslation('sdk', { keyPrefix: 'roomSettings' })
  const { t: tRooms } = useTranslation('rooms', { keyPrefix: 'admin' })

  const [searchParams] = useSearchParams()
  const roomSlug = searchParams.get('slug')?.trim()

  const { isLoggedIn } = useUser({ fetchUserOptions: { attemptSilent: false } })

  useEffect(() => {
    if (isLoggedIn === false) {
      // returnTo defaults to the current URL, so the user comes back to this
      // popup (with the slug preserved) once authentication completes.
      window.location.href = authUrl({})
    }
  }, [isLoggedIn])

  const {
    data: room,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [keys.room, roomSlug],
    queryFn: () => fetchRoom({ roomId: roomSlug as string }),
    enabled: !!isLoggedIn && !!roomSlug,
    retry: false,
  })

  const { mutateAsync: patchRoom } = usePatchRoom()
  const { data: configData } = useConfig()

  const configuration = room?.configuration

  const accessLevelItems = useAccessLevelItems()

  const currentSources = useMemo(() => {
    const defaultSources = configData?.livekit?.default_sources ?? []

    if (
      configuration?.can_publish_sources == undefined ||
      !Array.isArray(configuration?.can_publish_sources)
    ) {
      return defaultSources
    }
    return configuration.can_publish_sources
  }, [configData, configuration?.can_publish_sources])

  const patchConfiguration = (
    newConfiguration: NonNullable<typeof configuration>
  ) => {
    if (!roomSlug) return
    patchRoom({
      roomId: roomSlug,
      room: { configuration: newConfiguration },
    }).catch((e) => reportError('generic_failure', e))
  }

  const updateSource = (sources: Source[], enabled: boolean) => {
    patchConfiguration({
      ...configuration,
      can_publish_sources: updatePublishSources(
        currentSources,
        sources,
        enabled
      ),
    })
  }

  const toggleMicrophone = (enabled: boolean) =>
    updateSource([Track.Source.Microphone], enabled)
  const toggleCamera = (enabled: boolean) =>
    updateSource([Track.Source.Camera], enabled)
  const toggleScreenShare = (enabled: boolean) =>
    updateSource(
      [Track.Source.ScreenShare, Track.Source.ScreenShareAudio],
      enabled
    )
  const toggleMuting = (enabled: boolean) =>
    patchConfiguration({
      ...configuration,
      everyone_can_mute: enabled,
    })

  const isMicrophoneEnabled = isSubsetOf(
    [Track.Source.Microphone],
    currentSources
  )
  const isCameraEnabled = isSubsetOf([Track.Source.Camera], currentSources)
  const isScreenShareEnabled = isSubsetOf(
    [Track.Source.ScreenShare, Track.Source.ScreenShareAudio],
    currentSources
  )
  const isMutingEnabled = configuration?.everyone_can_mute ?? true

  const renderCentered = (children: ReactNode) => (
    <div
      className={css({
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        width: '100%',
        padding: '1.5rem',
      })}
    >
      {children}
    </div>
  )

  if (!roomSlug || isError) {
    return renderCentered(
      <Text variant="note" margin={false}>
        {t('error')}
      </Text>
    )
  }

  if (isLoggedIn === undefined || isLoggedIn === false || isLoading || !room) {
    return renderCentered(<Spinner />)
  }

  const isAdministrable = room.accesses !== undefined

  if (!isAdministrable) {
    return renderCentered(
      <Text variant="note" margin={false}>
        {t('notAllowed')}
      </Text>
    )
  }

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minHeight: 0,
      })}
    >
      <header
        className={css({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '0.5rem',
          padding: '1.5rem',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
          borderBottomColor: 'greyscale.250',
        })}
      >
        <img
          src="/assets/logo.svg"
          alt=""
          className={css({
            maxHeight: '40px',
            flexShrink: 0,
          })}
        />
        <div className={css({ display: 'flex', flexDirection: 'column' })}>
          <H
            lvl={1}
            margin={false}
            className={css({
              fontWeight: 500,
            })}
          >
            {t('title')}
          </H>
          <Text variant="smNote" margin={false}>
            {roomSlug}
          </Text>
        </div>
      </header>
      <div
        className={css({
          flexGrow: 1,
          overflowY: 'auto',
          minHeight: 0,
        })}
      >
        <SectionHeader>{tRooms('moderation.title')}</SectionHeader>
        <SectionBody>
          <Text
            variant="note"
            wrap="balance"
            className={css({
              textStyle: 'sm',
            })}
            margin={'md'}
          >
            {tRooms('moderation.description')}
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
              label={tRooms('moderation.microphone.label')}
              description={tRooms('moderation.microphone.description')}
              isSelected={isMicrophoneEnabled}
              onChange={toggleMicrophone}
              wrapperProps={{
                noMargin: true,
                fullWidth: true,
              }}
            />
            <Field
              type="switch"
              label={tRooms('moderation.camera.label')}
              description={tRooms('moderation.camera.description')}
              isSelected={isCameraEnabled}
              onChange={toggleCamera}
              wrapperProps={{
                noMargin: true,
                fullWidth: true,
              }}
            />
            <Field
              type="switch"
              label={tRooms('moderation.screenshare.label')}
              description={tRooms('moderation.screenshare.description')}
              isSelected={isScreenShareEnabled}
              onChange={toggleScreenShare}
              wrapperProps={{
                noMargin: true,
                fullWidth: true,
              }}
            />
            <Field
              type="switch"
              label={tRooms('moderation.mute.label')}
              description={tRooms('moderation.mute.description')}
              isSelected={isMutingEnabled}
              onChange={toggleMuting}
              wrapperProps={{
                noMargin: true,
                fullWidth: true,
              }}
            />
          </div>
        </SectionBody>
        <SectionHeader>{tRooms('access.title')}</SectionHeader>
        <SectionBody>
          <Text
            variant="note"
            wrap="balance"
            className={css({
              textStyle: 'sm',
            })}
            margin={'md'}
          >
            {tRooms('access.description')}
          </Text>
          <Field
            type="radioGroup"
            label={tRooms('access.type')}
            aria-label={tRooms('access.type')}
            labelProps={{
              className: css({
                fontSize: '1rem',
                paddingBottom: '1rem',
              }),
            }}
            value={room.access_level ?? null}
            onChange={(value) =>
              patchRoom({
                roomId: roomSlug,
                room: { access_level: value as ApiAccessLevel },
              }).catch((e) => reportError('generic_failure', e))
            }
            items={accessLevelItems}
          />
          {room.access_level_needs_choice && (
            <Text
              role="status"
              variant="warning"
              wrap="pretty"
              className={css({
                textStyle: 'sm',
              })}
              margin={'md'}
            >
              {tRooms('access.enforced', {
                level: tRooms(
                  `access.levels.${effectiveAccessLevel(room)}.label`
                ),
              })}
            </Text>
          )}
        </SectionBody>
      </div>
      <footer
        className={css({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1rem 1.5rem',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: 'greyscale.250',
        })}
      >
        <Button size="sm" onPress={() => window.close()}>
          {t('closeButton')}
        </Button>
      </footer>
    </div>
  )
}

export default SettingsPopup
