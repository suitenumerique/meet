import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { Participant } from 'livekit-client'
import { useLowerHandParticipants } from '@/features/rooms/api/lowerHandParticipants'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'

type LowerAllHandsButtonProps = {
  participants: Array<Participant>
}

export const LowerAllHandsButton = ({
  participants,
}: LowerAllHandsButtonProps) => {
  const { lowerHandParticipants } = useLowerHandParticipants()
  const { t } = useTranslation('rooms')

  const isAdminOrOwner = useIsAdminOrOwner()
  if (!isAdminOrOwner) return null

  return (
    <Button
      aria-label={t('participants.lowerParticipantsHand')}
      size="sm"
      fullWidth
      variant="text"
      onPress={() => lowerHandParticipants(participants)}
      data-attr="participants-lower-hands"
    >
      {t('participants.lowerParticipantsHand')}
    </Button>
  )
}
