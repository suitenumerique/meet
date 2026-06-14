import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'
import { useLowerHandParticipants } from '@/features/rooms/api/lowerHandParticipants'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { css } from '@/styled-system/css'
import { RiHand } from '@remixicon/react'

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
      variant="tertiary"
      onPress={() => lowerHandParticipants(participants)}
      data-attr="participants-lower-hands"
      className={css({
        marginBottom: '0.5rem',
      })}
    >
      <RiHand size={16} />
      {t('participants.lowerParticipantsHand')}
    </Button>
  )
}
