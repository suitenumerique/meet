import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'
import { useLowerHandParticipants } from '../api/lowerHandParticipants'
import { css } from '@/styled-system/css'
import { RiHand } from '@remixicon/react'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'

type LowerAllHandsButtonProps = {
  participants: Array<Participant>
}

const LowerAllHandsButtonInner = ({
  participants,
}: LowerAllHandsButtonProps) => {
  const { lowerHandParticipants } = useLowerHandParticipants()
  const { t } = useTranslation('rooms')

  if (!participants.length) return null

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

export const LowerAllHandsButton = ({
  participants,
}: LowerAllHandsButtonProps) => {
  return (
    <AdminOrOwnerOnly>
      <LowerAllHandsButtonInner participants={participants} />
    </AdminOrOwnerOnly>
  )
}
