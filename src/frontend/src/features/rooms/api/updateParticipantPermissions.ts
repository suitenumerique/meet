import { Participant, Track } from 'livekit-client'
import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import Source = Track.Source

export const useParticipantPermissions = () => {
  const data = useRoomData()

  const updateParticipantPermissions = async (
    participant: Participant,
    sources: Array<Source>
  ) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    const newPermissions = {
      can_subscribe: participant.permissions?.canSubscribe,
      can_publish_data: participant.permissions?.canPublishData,
      can_update_metadata: participant.permissions?.canUpdateMetadata,
      can_subscribe_metrics: participant.permissions?.canSubscribeMetrics,
      can_publish: sources.length > 0,
      can_publish_sources: sources.map((source) => source.toUpperCase()),
    }

    try {
      return fetchApi(`rooms/${data.id}/update-participant/`, {
        method: 'POST',
        body: JSON.stringify({
          participant_identity: participant.identity,
          permission: newPermissions,
        }),
      })
    } catch (error) {
      console.error(
        `Failed to update participant's permissions ${participant.identity}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
  return { updateParticipantPermissions }
}
