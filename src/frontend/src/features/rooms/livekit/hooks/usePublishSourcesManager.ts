import { RoomEvent, Track } from 'livekit-client'
import { useCallback, useMemo } from 'react'
import { useConfig } from '@/api/useConfig'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRemoteParticipants } from '@livekit/components-react'
import { useUpdateParticipantsPermissions } from '@/features/rooms/api/updateParticipantsPermissions'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import Source = Track.Source
import {
  NotificationType,
  useNotifyParticipants,
} from '@/features/notifications'
import { reportError } from '@/features/analytics/telemetry'

export const updatePublishSources = (
  currentSources: Source[],
  sources: Source[],
  enabled: boolean
): Source[] => {
  if (enabled) {
    const combined = [...currentSources, ...sources]
    return Array.from(new Set(combined))
  } else {
    return currentSources.filter(
      (source) => !sources.some((newSource) => newSource === source)
    )
  }
}

export const usePublishSourcesManager = () => {
  const { mutateAsync: patchRoom } = usePatchRoom()

  const data = useRoomData()
  const { data: configData } = useConfig()
  const configuration = data?.configuration

  const { notifyParticipants } = useNotifyParticipants()

  // The name can be misleading—use the slug instead to ensure the correct React Query key is updated.
  const roomId = data?.slug

  const { updateParticipantsPermissions } = useUpdateParticipantsPermissions()
  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [RoomEvent.ParticipantAttributesChanged],
  })

  const unprivilegedRemoteParticipants = remoteParticipants.filter(
    (participant) => !getParticipantIsRoomAdminOrOwner(participant)
  )

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

  const updateSource = useCallback(
    async (sources: Source[], enabled: boolean) => {
      if (!roomId || currentSources == undefined) return

      try {
        const newSources = updatePublishSources(
          currentSources,
          sources,
          enabled
        )

        const newConfiguration = {
          ...configuration,
          can_publish_sources: newSources,
        }

        await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        await updateParticipantsPermissions(
          unprivilegedRemoteParticipants,
          newSources
        )

        if (!enabled) {
          /*
           * We can't rely solely on the ParticipantPermissionsChanged event here,
           * because for local participants it is emitted twice (once from Participant, once from LocalParticipant).
           * livekit/client-sdk-js/issues/1637
           * */
          await notifyParticipants({
            type: NotificationType.PermissionsRemoved,
            destinationIdentities: unprivilegedRemoteParticipants.map(
              (p) => p.identity
            ),
            additionalData: {
              data: {
                removedSources: sources,
              },
            },
          })
        }

        return { configuration: newConfiguration }
      } catch (error) {
        reportError('publish_sources_failure', error, {
          context: `Failed to update ${sources}:`,
        })
        return { success: false, error }
      }
    },
    [
      notifyParticipants,
      configuration,
      currentSources,
      roomId,
      patchRoom,
      unprivilegedRemoteParticipants,
      updateParticipantsPermissions,
    ]
  )

  const toggleMicrophone = useCallback(
    (enabled: boolean) => updateSource([Source.Microphone], enabled),
    [updateSource]
  )

  const toggleCamera = useCallback(
    (enabled: boolean) => updateSource([Source.Camera], enabled),
    [updateSource]
  )

  const toggleScreenShare = useCallback(
    (enabled: boolean) =>
      updateSource([Source.ScreenShare, Source.ScreenShareAudio], enabled),
    [updateSource]
  )

  const isMicrophoneEnabled = isSubsetOf([Source.Microphone], currentSources)
  const isCameraEnabled = isSubsetOf([Source.Camera], currentSources)
  const isScreenShareEnabled = isSubsetOf(
    [Source.ScreenShare, Source.ScreenShareAudio],
    currentSources
  )

  return {
    updateSource,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  }
}
