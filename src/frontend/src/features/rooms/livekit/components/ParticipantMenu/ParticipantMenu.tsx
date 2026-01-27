import { Menu as RACMenu } from 'react-aria-components'
import { Participant } from 'livekit-client'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useIsOwner } from '@/features/rooms/livekit/hooks/useIsOwner'
import { useIsParticipantOwner } from '@/features/rooms/livekit/hooks/useIsParticipantOwner'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getParticipantCanBePromoted } from '@/features/rooms/utils/getParticipantCanBePromoted'
import { ApiAccessRole } from '@/features/rooms/api/ApiRoom'
import { PinMenuItem } from './PinMenuItem'
import { RemoveMenuItem } from './RemoveMenuItem'
import { MakeOwnerMenuItem } from './MakeOwnerMenuItem'
import { RemoveOwnerMenuItem } from './RemoveOwnerMenuItem'

export const ParticipantMenu = ({
  participant,
}: {
  participant: Participant
}) => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const isOwner = useIsOwner()
  const isParticipantOwner = useIsParticipantOwner(participant)
  const roomData = useRoomData()

  const canModerateParticipant = !participant.isLocal && isAdminOrOwner

  // Check if participant can be promoted: current user must be owner,
  // participant must be authenticated (not anonymous), and not already an owner
  const canBePromoted = getParticipantCanBePromoted(participant)
  const canPromote =
    !participant.isLocal && isOwner && canBePromoted && !isParticipantOwner

  // Check if participant can be demoted: current user must be owner,
  // participant must be an owner, and there must be at least 2 owners
  const ownerCount =
    roomData?.accesses?.filter((a) => a.role === ApiAccessRole.OWNER).length ?? 0
  const canDemote =
    !participant.isLocal && isOwner && isParticipantOwner && ownerCount > 1

  return (
    <RACMenu
      style={{
        minWidth: '75px',
      }}
    >
      <PinMenuItem participant={participant} />
      {canPromote && <MakeOwnerMenuItem participant={participant} />}
      {canDemote && <RemoveOwnerMenuItem participant={participant} />}
      {canModerateParticipant && <RemoveMenuItem participant={participant} />}
    </RACMenu>
  )
}
