import { useMemo } from 'react'

import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useCanManageLobby } from '@/features/rooms/livekit/hooks/useCanManageLobby'
import { useEnterRoom } from '../api/enterRoom'
import {
  useListWaitingParticipants,
  type WaitingParticipant,
} from '../../participants/api/listWaitingParticipants'
import { reportError } from '@/features/analytics/telemetry'

export const useWaitingParticipants = () => {
  const roomData = useRoomData()
  const roomId = roomData?.id || '' // FIXME - bad practice

  const canManageLobby = useCanManageLobby()

  const { data: waitingData, refetch: refetchWaiting } =
    useListWaitingParticipants(roomId, {
      retry: false,
      enabled: false,
    })

  const waitingParticipants = useMemo(
    () => (canManageLobby ? waitingData?.participants || [] : []),
    [waitingData, canManageLobby]
  )

  const { mutateAsync: enterRoom } = useEnterRoom()

  const handleParticipantEntry = async (
    participant: WaitingParticipant,
    allowEntry: boolean
  ) => {
    await enterRoom({
      roomId: roomId,
      allowEntry,
      participantId: participant.id,
    })
    await refetchWaiting()
  }

  const handleParticipantsEntry = async (
    allowEntry: boolean
  ): Promise<void> => {
    try {
      await Promise.all(
        waitingParticipants.map((participant) =>
          enterRoom({
            roomId: roomId,
            allowEntry,
            participantId: participant.id,
          })
        )
      )

      await refetchWaiting()
    } catch (e) {
      reportError('generic_failure', e)
    }
  }

  return {
    waitingParticipants,
    handleParticipantEntry,
    handleParticipantsEntry,
  }
}
