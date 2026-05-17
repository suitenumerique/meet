import { Participant, Track } from 'livekit-client'
import Source = Track.Source
import { useRoomData } from '../livekit/hooks/useRoomData'
import {
  useNotifyParticipants,
  NotificationType,
} from '@/features/notifications'
import { fetchApi } from '@/api/fetchApi'
import { useIsAdminOrOwner } from '../livekit/hooks/useIsAdminOrOwner'

import { useCallback } from 'react'

export const useMuteParticipant = () => {
  const apiRoomData = useRoomData()
  const { notifyParticipants } = useNotifyParticipants()
  const isAdminOrOwner = useIsAdminOrOwner()

  const muteParticipant = useCallback(
    async (participant: Participant) => {
      if (!apiRoomData?.livekit?.room) {
        throw new Error('Room id is not available')
      }

      const trackSid = participant.getTrackPublication(
        Source.Microphone
      )?.trackSid

      if (!trackSid) {
        return
      }

      // Guard against undefined token for non-admin users
      if (!isAdminOrOwner && !apiRoomData.livekit.token) {
        console.error('Cannot mute participant: missing auth token')
        return
      }

      const headers = !isAdminOrOwner
        ? { Authorization: `Bearer ${apiRoomData.livekit.token}` }
        : undefined

      let response
      try {
        response = await fetchApi(
          `rooms/${apiRoomData.livekit.room}/mute-participant/`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              participant_identity: participant.identity,
              track_sid: trackSid,
            }),
          }
        )
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

      return response
    },
    [apiRoomData, isAdminOrOwner, notifyParticipants]
  )

  return { muteParticipant }
}
