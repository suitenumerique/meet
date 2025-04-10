import { Participant, Track } from 'livekit-client'
import Source = Track.Source
import { fetchServerApi } from './fetchServerApi'
import { buildServerApiUrl } from './buildServerApiUrl'
import { useRoomData } from '../hooks/useRoomData'
import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'

export const useMuteParticipant = () => {
  const data = useRoomData()

  const { notifyParticipants } = useNotifyParticipants()

  const muteParticipant = async (participant: Participant) => {
    if (!data || !data?.livekit) {
      throw new Error('Room data is not available')
    }
    const trackSid = participant.getTrackPublication(
      Source.Microphone
    )?.trackSid

    if (!trackSid) {
      throw new Error('Missing audio track')
    }

    try {
      const response = await fetchServerApi(
        buildServerApiUrl(
          data.livekit.url,
          'twirp/livekit.RoomService/MutePublishedTrack'
        ),
        data.livekit.token,
        {
          method: 'POST',
          body: JSON.stringify({
            room: data.livekit.room,
            identity: participant.identity,
            muted: true,
            track_sid: trackSid,
          }),
        }
      )

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
