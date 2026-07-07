import {
  useParticipantAttribute,
  useRoomContext,
} from '@livekit/components-react'
import { ParticipantRole } from '@/features/rooms/api/ApiRoom'

export const useIsAdminOrOwner = () => {
  const room = useRoomContext()
  const localParticipant = room.localParticipant
  const role = useParticipantAttribute('room_role', {
    participant: localParticipant,
  })
  return (
    role !== undefined &&
    ['administrator', 'owner'].includes(role as ParticipantRole)
  )
}
