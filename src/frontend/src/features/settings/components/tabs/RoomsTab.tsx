import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/auth/api/useUser'
import { useConfig } from '@/api/useConfig'
import {
  usePatchUser,
  patchUserMutationKey,
} from '@/features/auth/api/patchUser'
import { type ApiUser } from '@/features/auth/api/ApiUser'
import { ApiAccessLevel, RoomConfiguration } from '@/features/rooms/api/ApiRoom'
import { useMemo } from 'react'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { Track } from 'livekit-client'
import Source = Track.Source
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import { updatePublishSources } from '@/features/rooms/livekit/hooks/usePublishSourcesManager'
import { Field, H, Text } from '@/primitives'
import { TabPanel } from '@/primitives/Tabs'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'

type RoomsTabProps = {
  id: string
}

export const RoomsTab = ({ id }: RoomsTabProps) => {
  const { t } = useTranslation('settings', { keyPrefix: 'roomDefaults' })
  const { t: tAdmin } = useTranslation('rooms', {
    keyPrefix: 'admin',
    useSuspense: false,
  })

  const { user } = useUser()
  const { data: configData } = useConfig()

  // Optimistic updates: patch the cache immediately so the UI updates
  // instantly and concurrent saves always build on the latest local state.
  // Since each PATCH replaces the full JSON config, this avoids overwriting
  // earlier changes with a stale snapshot.
  //
  // No per-request rollback: later requests already include earlier changes.
  // Once the last in-flight save completes, re-fetch the server state once to
  // restore the UI if all saves failed.
  const { mutate: patchUser } = usePatchUser({
    onMutate: async ({ user: partialUser }) => {
      await queryClient.cancelQueries({ queryKey: [keys.user] })
      queryClient.setQueryData<ApiUser | false>([keys.user], (previous) =>
        previous ? { ...previous, ...partialUser } : previous
      )
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: patchUserMutationKey }) === 1) {
        queryClient.invalidateQueries({ queryKey: [keys.user] })
      }
    },
  })

  const configuration: RoomConfiguration = useMemo(
    () => user?.default_room_configuration ?? {},
    [user?.default_room_configuration]
  )

  const currentSources: Source[] = useMemo(() => {
    const defaultSources = configData?.livekit?.default_sources ?? []
    if (!Array.isArray(configuration?.can_publish_sources)) {
      return defaultSources
    }
    return configuration.can_publish_sources
  }, [configData, configuration])

  const accessLevel =
    user?.default_room_access_level ??
    configData?.resource?.default_access_level ??
    ApiAccessLevel.PUBLIC

  // Every change saves immediately; the optimistic onMutate above keeps the
  // cached user (and therefore `configuration`) in sync right away.
  const saveConfiguration = (newConfiguration: RoomConfiguration) => {
    if (!user) return
    patchUser({
      userId: user.id,
      user: { default_room_configuration: newConfiguration },
    })
  }

  const updateSource = (sources: Source[], enabled: boolean) =>
    saveConfiguration({
      ...configuration,
      can_publish_sources: updatePublishSources(
        currentSources,
        sources,
        enabled
      ),
    })

  const isMicrophoneEnabled = isSubsetOf([Source.Microphone], currentSources)
  const isCameraEnabled = isSubsetOf([Source.Camera], currentSources)
  const isScreenShareEnabled = isSubsetOf(
    [Source.ScreenShare, Source.ScreenShareAudio],
    currentSources
  )
  const isMutingEnabled = configuration?.everyone_can_mute ?? true

  const saveAccessLevel = (newAccessLevel: ApiAccessLevel) => {
    if (!user) return
    patchUser({
      userId: user.id,
      user: { default_room_access_level: newAccessLevel },
    })
  }

  return (
    <TabPanel padding={'md'} flex id={id}>
      <H lvl={2}>{t('heading')}</H>
      <Text variant="note" margin={'md'}>
        {t('description')}
      </Text>
      <RACSeparator
        className={css({
          border: 'none',
          height: '1px',
          width: '100%',
          flexShrink: 0,
          background: 'greyscale.250',
        })}
      />
      <H
        lvl={3}
        variant={'h2'}
        className={css({
          fontWeight: 500,
        })}
        margin="sm"
      >
        {tAdmin('moderation.title')}
      </H>
      <Text
        variant="note"
        wrap="balance"
        className={css({
          textStyle: 'sm',
        })}
        margin={'md'}
      >
        {tAdmin('moderation.description')}
      </Text>
      <Field
        type="switch"
        label={tAdmin('moderation.microphone.label')}
        isSelected={isMicrophoneEnabled}
        onChange={(enabled) => updateSource([Source.Microphone], enabled)}
      />
      <Field
        type="switch"
        label={tAdmin('moderation.camera.label')}
        isSelected={isCameraEnabled}
        onChange={(enabled) => updateSource([Source.Camera], enabled)}
      />
      <Field
        type="switch"
        label={tAdmin('moderation.screenshare.label')}
        isSelected={isScreenShareEnabled}
        onChange={(enabled) =>
          updateSource([Source.ScreenShare, Source.ScreenShareAudio], enabled)
        }
      />
      <Field
        type="switch"
        label={tAdmin('moderation.mute.label')}
        isSelected={isMutingEnabled}
        onChange={(enabled) =>
          saveConfiguration({ ...configuration, everyone_can_mute: enabled })
        }
      />
      <RACSeparator
        className={css({
          border: 'none',
          height: '1px',
          width: '100%',
          flexShrink: 0,
          marginY: '1rem',
          background: 'greyscale.250',
        })}
      />
      <H
        lvl={3}
        variant={'h2'}
        className={css({
          fontWeight: 500,
        })}
        margin="sm"
      >
        {tAdmin('access.title')}
      </H>
      <Field
        type="radioGroup"
        label={tAdmin('access.type')}
        value={accessLevel}
        labelProps={{
          className: css({
            fontSize: '1rem',
            paddingBottom: '1rem',
          }),
        }}
        onChange={(value) => saveAccessLevel(value as ApiAccessLevel)}
        items={[
          {
            value: ApiAccessLevel.PUBLIC,
            label: tAdmin('access.levels.public.label'),
            description: tAdmin('access.levels.public.description'),
          },
          {
            value: ApiAccessLevel.TRUSTED,
            label: tAdmin('access.levels.trusted.label'),
            description: tAdmin('access.levels.trusted.description'),
          },
          {
            value: ApiAccessLevel.RESTRICTED,
            label: tAdmin('access.levels.restricted.label'),
            description: tAdmin('access.levels.restricted.description'),
          },
        ]}
      />
    </TabPanel>
  )
}
