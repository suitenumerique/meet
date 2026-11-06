import type { Participant, Track } from 'livekit-client'
import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useDefaultPublishSources } from '@/features/rooms/livekit/hooks/useRoomPublishSources'
import { reportError } from '@/features/analytics/telemetry'

export const SPEAKER_ATTRIBUTE = 'is_speaker'

export const getParticipantIsSpeaker = (participant: Participant): boolean =>
  participant.attributes?.[SPEAKER_ATTRIBUTE] === 'true'

export const useParticipantSpeaker = () => {
  const data = useRoomData()
  const defaultSources = useDefaultPublishSources()

  const updateSpeaker = async (
    participant: Participant,
    isSpeaker: boolean,
    sources: Track.Source[]
  ) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    const attributes: Record<string, string> = {
      [SPEAKER_ATTRIBUTE]: isSpeaker ? 'true' : '',
    }

    try {
      return await fetchApi(`rooms/${data.id}/update-participant/`, {
        method: 'POST',
        body: JSON.stringify({
          participant_identity: participant.identity,
          attributes,
          permission: {
            can_subscribe: participant.permissions?.canSubscribe,
            can_publish_data: participant.permissions?.canPublishData,
            can_update_metadata: participant.permissions?.canUpdateMetadata,
            can_subscribe_metrics: participant.permissions?.canSubscribeMetrics,
            can_publish: sources.length > 0,
            can_publish_sources: sources,
          },
        }),
      })
    } catch (error) {
      reportError('permissions_api_failure', error, {
        context: `Failed to update speaker status of ${participant.identity}`,
      })
      throw error
    }
  }

  const makeSpeaker = (participant: Participant) =>
    updateSpeaker(participant, true, defaultSources)

  const removeSpeaker = (
    participant: Participant,
    roomSources: Track.Source[]
  ) => updateSpeaker(participant, false, roomSources)

  return { makeSpeaker, removeSpeaker }
}
