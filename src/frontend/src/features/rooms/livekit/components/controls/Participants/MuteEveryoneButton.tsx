import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'
import { useMuteParticipants } from '@/features/rooms/api/muteParticipants'
import { RiMicOffLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'

type MuteEveryoneButtonProps = {
  participants: Array<Participant>
}

const MuteEveryoneButtonInner = ({ participants }: MuteEveryoneButtonProps) => {
  const { muteParticipants } = useMuteParticipants()
  const { t } = useTranslation('rooms')

  if (!participants.length) return null

  return (
    <Button
      aria-label={t('participants.muteParticipants')}
      size="sm"
      fullWidth
      variant="tertiary"
      onPress={() => muteParticipants(participants)}
      data-attr="participants-mute"
      className={css({
        marginBottom: '0.5rem',
      })}
    >
      <RiMicOffLine size={16} />
      {t('participants.muteParticipants')}
    </Button>
  )
}

export const MuteEveryoneButton = ({
  participants,
}: MuteEveryoneButtonProps) => {
  return (
    <AdminOrOwnerOnly>
      <MuteEveryoneButtonInner participants={participants} />
    </AdminOrOwnerOnly>
  )
}
