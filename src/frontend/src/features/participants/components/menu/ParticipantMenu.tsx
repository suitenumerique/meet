import { Menu as RACMenu } from 'react-aria-components'
import type { Participant } from 'livekit-client'
import { PinMenuItem } from './items/PinMenuItem'
import { RemoveMenuItem } from './items/RemoveMenuItem'
import { PromoteMenuItem } from './items/PromoteMenuItem'
import { SpeakerMenuItem } from './items/SpeakerMenuItem'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useParticipantAttributes } from '@livekit/components-react'
import { useHasLockedSource } from '@/features/rooms/livekit/hooks/useRoomPublishSources'

export const ParticipantMenu = ({
  participant,
}: {
  participant: Participant
}) => {
  const isLocalUserAdminOrOwner = useIsAdminOrOwner()

  const { attributes } = useParticipantAttributes({ participant })

  const isAdmin = attributes?.room_role === 'administrator'
  const isOwner = attributes?.room_role === 'owner'
  const isAuthenticated = attributes?.is_authenticated == 'true'
  const isSpeaker = attributes?.is_speaker === 'true'

  const hasLockedSource = useHasLockedSource()

  const canManage = !participant.isLocal && isLocalUserAdminOrOwner && !isOwner
  const canToggleSpeaker =
    canManage && !isAdmin && (isSpeaker || hasLockedSource)

  return (
    <RACMenu
      style={{
        minWidth: '100px',
      }}
    >
      <PinMenuItem participant={participant} />
      {canManage && (
        <RemoveMenuItem
          identity={participant.identity}
          displayedName={participant.name}
        />
      )}
      {canManage && isAuthenticated && (
        <PromoteMenuItem
          identity={participant.identity}
          isAdmin={isAdmin}
          displayedName={participant.name}
        />
      )}
      {canToggleSpeaker && (
        <SpeakerMenuItem participant={participant} isSpeaker={isSpeaker} />
      )}
    </RACMenu>
  )
}
