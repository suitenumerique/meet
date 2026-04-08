import { Participant, Track } from 'livekit-client'
import Source = Track.Source
import { useRoomData } from '../livekit/hooks/useRoomData'
import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'
import { fetchApi } from '@/api/fetchApi'

export const useMuteParticipant = () => {
  const apiRoomData = useRoomData()
  const { notifyParticipants } = useNotifyParticipants()

  const muteParticipant = async (participant: Participant) => {
    if (!apiRoomData?.livekit?.room) {
      throw new Error('Room id is not available')
    }
    const trackSid = participant.getTrackPublication(
      Source.Microphone
    )?.trackSid

    if (!trackSid) {
      return
    }

    try {
      const response = fetchApi(
        `rooms/${apiRoomData?.livekit?.room}/mute-participant/`,
        {
          method: 'POST',
          body: JSON.stringify({
            token: apiRoomData?.livekit?.token,
            participant_identity: participant.identity,
            track_sid: trackSid,
          }),
        }
      )
      return response
    } catch (error) {
      console.error(
        `Failed to mute participant ${participant.identity}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return
    }

    try {
      await notifyParticipants({
        type: NotificationType.ParticipantMuted,
        destinationIdentities: [participant.identity],
      })
    } catch (e) {
      console.error(
        `Failed to notify muted participant ${participant.identity}: ${e}`
      )
    }
  }
  return { muteParticipant }
}
