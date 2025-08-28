import { Menu as RACMenu } from 'react-aria-components'
import { Participant } from 'livekit-client'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { PinMenuItem } from './PinMenuItem'
import { RemoveMenuItem } from './RemoveMenuItem'

export const ParticipantMenu = ({
  participant,
}: {
  participant: Participant
}) => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const canModerateParticipant = !participant.isLocal && isAdminOrOwner
  return (
    <RACMenu
      style={{
        minWidth: '75px',
      }}
    >
      <PinMenuItem participant={participant} />
      {canModerateParticipant && <RemoveMenuItem participant={participant} />}
    </RACMenu>
  )
}
