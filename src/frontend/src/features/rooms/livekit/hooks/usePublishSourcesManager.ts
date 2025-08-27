import { Track } from 'livekit-client'
import { useCallback, useMemo } from 'react'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRemoteParticipants } from '@livekit/components-react'
import { useUpdateParticipantsPermissions } from '@/features/rooms/api/updateParticipantsPermissions'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import Source = Track.Source

// todo - synchronisation with backend
export const DEFAULT_PUBLISH_SOURCES: Array<Source> = [
  Source.Microphone,
  Source.Camera,
  Source.ScreenShare,
  Source.ScreenShareAudio,
]

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
  const configuration = data?.configuration

  // The name can be misleading—use the slug instead to ensure the correct React Query key is updated.
  const roomId = data?.slug

  const { updateParticipantsPermissions } = useUpdateParticipantsPermissions()
  const remoteParticipants = useRemoteParticipants()

  // todo - filter, update only contributors and not admin

  const currentSources = useMemo(() => {
    if (
      configuration?.can_publish_sources == undefined ||
      !Array.isArray(configuration?.can_publish_sources)
    ) {
      return DEFAULT_PUBLISH_SOURCES
    }
    return configuration.can_publish_sources.map((source) => {
      return source as Source
    })
  }, [configuration?.can_publish_sources])

  const updateSource = useCallback(
    async (sources: Source[], enabled: boolean) => {
      if (!roomId) return

      try {
        const newSources = updatePublishSources(
          currentSources,
          sources,
          enabled
        )

        const newConfiguration = {
          ...configuration,
          can_publish_sources: newSources as string[],
        }

        const room = await patchRoom({
          roomId,
          room: { configuration: newConfiguration },
        })

        queryClient.setQueryData([keys.room, roomId], room)

        await updateParticipantsPermissions(remoteParticipants, newSources)

        return { configuration: newConfiguration }
      } catch (error) {
        console.error(`Failed to update ${sources}:`, error)
        return { success: false, error }
      }
    },
    [
      configuration,
      currentSources,
      roomId,
      patchRoom,
      remoteParticipants,
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
