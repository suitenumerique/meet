import { RoomEvent, Track } from 'livekit-client'
import { useCallback } from 'react'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { useRemoteParticipants } from '@livekit/components-react'
import { useUpdateParticipantsPermissions } from '@/features/rooms/api/updateParticipantsPermissions'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isSubsetOf } from '@/features/rooms/utils/isSubsetOf'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import {
  getParticipantIsSpeaker,
  useParticipantSpeaker,
} from '@/features/participants/api/updateParticipantSpeaker'
import {
  useDefaultPublishSources,
  useRoomPublishSources,
} from '@/features/rooms/livekit/hooks/useRoomPublishSources'
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
  const configuration = data?.configuration
  const currentSources = useRoomPublishSources()
  const defaultSources = useDefaultPublishSources()

  const { notifyParticipants } = useNotifyParticipants()

  // The name can be misleading—use the slug instead to ensure the correct React Query key is updated.
  const roomId = data?.slug

  const { updateParticipantsPermissions } = useUpdateParticipantsPermissions()
  const { removeSpeaker } = useParticipantSpeaker()
  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [RoomEvent.ParticipantAttributesChanged],
  })

  const restrictedRemoteParticipants = remoteParticipants.filter(
    (participant) =>
      !getParticipantIsRoomAdminOrOwner(participant) &&
      !getParticipantIsSpeaker(participant)
  )

  const speakers = remoteParticipants.filter(getParticipantIsSpeaker)

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
          restrictedRemoteParticipants,
          newSources
        )

        if (isSubsetOf(defaultSources, newSources)) {
          await Promise.all(
            speakers.map((speaker) => removeSpeaker(speaker, newSources))
          )
        }

        if (!enabled) {
          /*
           * We can't rely solely on the ParticipantPermissionsChanged event here,
           * because for local participants it is emitted twice (once from Participant, once from LocalParticipant).
           * livekit/client-sdk-js/issues/1637
           * */
          await notifyParticipants({
            type: NotificationType.PermissionsRemoved,
            destinationIdentities: restrictedRemoteParticipants.map(
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
      defaultSources,
      roomId,
      patchRoom,
      restrictedRemoteParticipants,
      speakers,
      removeSpeaker,
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
