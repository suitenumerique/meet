import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { Participant } from 'livekit-client'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useMuteParticipants } from '@/features/rooms/api/muteParticipants'
import { RiMicOffLine } from '@remixicon/react'
import { css } from '@/styled-system/css'

type MuteEveryoneButtonProps = {
  participants: Array<Participant>
}

export const MuteEveryoneButton = ({
  participants,
}: MuteEveryoneButtonProps) => {
  const { muteParticipants } = useMuteParticipants()
  const { t } = useTranslation('rooms')

  const isAdminOrOwner = useIsAdminOrOwner()
  if (!isAdminOrOwner || !participants.length) return null

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
