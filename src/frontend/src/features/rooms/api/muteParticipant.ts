import { Participant, Track } from 'livekit-client'
import Source = Track.Source
import { useRoomData } from '../livekit/hooks/useRoomData'
import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'
import { fetchApi } from '@/api/fetchApi'

export const useMuteParticipant = () => {
  const data = useRoomData()

  const { notifyParticipants } = useNotifyParticipants()

  const muteParticipant = async (participant: Participant) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }
    const trackSid = participant.getTrackPublication(
      Source.Microphone
    )?.trackSid

    if (!trackSid) {
      return
    }

    try {
      const response = await fetchApi(`rooms/${data.id}/mute-participant/`, {
        method: 'POST',
        body: JSON.stringify({
          participant_identity: participant.identity,
          track_sid: trackSid,
        }),
      })

      await notifyParticipants({
        type: NotificationType.ParticipantMuted,
        destinationIdentities: [participant.identity],
      })

      return response
    } catch (error) {
      console.error(
        `Failed to mute participant ${participant.identity}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
  return { muteParticipant }
}
