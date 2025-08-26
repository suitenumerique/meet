import { Participant } from 'livekit-client'
import { fetchApi } from '@/api/fetchApi.ts'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

export const useLowerHandParticipant = () => {
  const data = useRoomData()

  const lowerHandParticipant = async (participant: Participant) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    const newAttributes = {
      ...participant.attributes,
      handRaisedAt: '',
    }

    return await fetchApi(`rooms/${data.id}/update-participant/`, {
      method: 'POST',
      body: JSON.stringify({
        participant_identity: participant.identity,
        attributes: newAttributes,
      }),
    })
  }
  return { lowerHandParticipant }
}
