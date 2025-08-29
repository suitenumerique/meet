import { useIsAdminOrOwner } from './useIsAdminOrOwner'
import { Participant } from 'livekit-client'

export const useCanMute = (participant: Participant) => {
  const isAdminOrOwner = useIsAdminOrOwner()
  return participant.isLocal || isAdminOrOwner
}
