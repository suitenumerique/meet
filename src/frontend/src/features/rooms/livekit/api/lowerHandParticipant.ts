import { Participant } from 'livekit-client'
import { fetchServerApi } from './fetchServerApi'
import { buildServerApiUrl } from './buildServerApiUrl'
import { useRoomData } from '../hooks/useRoomData'

export const useLowerHandParticipant = () => {
  const data = useRoomData()

  const lowerHandParticipant = (participant: Participant) => {
    if (!data || !data?.livekit) {
      throw new Error('Room data is not available')
    }

    const newAttributes = {
      ...participant.attributes,
      handRaisedAt: '',
    }

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
          attributes: newAttributes,
          permission: participant.permissions,
        }),
      }
    )
  }
  return { lowerHandParticipant }
}
