import { Participant } from 'livekit-client'
import { fetchServerApi } from './fetchServerApi'
import { buildServerApiUrl } from './buildServerApiUrl'
import { useRoomData } from '../hooks/useRoomData'
import { safeParseMetadata } from '@/features/rooms/utils/safeParseMetadata'

export const useLowerHandParticipant = () => {
  const data = useRoomData()

  const lowerHandParticipant = (participant: Participant) => {
    if (!data || !data?.livekit) {
      throw new Error('Room data is not available')
    }
    const newMetadata = safeParseMetadata(participant.metadata) || {}
    newMetadata.raised = !newMetadata.raised
    return fetchServerApi(
      buildServerApiUrl(
        data.livekit.url,
        'twirp/livekit.RoomService/UpdateParticipant'
      ),
      data.livekit.token,
      {
        method: 'POST',
        body: JSON.stringify({
          room: data.livekit.room,
          identity: participant.identity,
          metadata: JSON.stringify(newMetadata),
          permission: participant.permissions,
        }),
      }
    )
  }
  return { lowerHandParticipant }
}
