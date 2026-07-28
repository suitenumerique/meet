import { Button, Menu } from '@/primitives'
import { RiMore2Fill } from '@remixicon/react'
import { ParticipantMenu } from './ParticipantMenu'
import type { Participant } from 'livekit-client'
import { useTranslation } from 'react-i18next'

export const ParticipantMenuButton = ({
  participant,
}: {
  participant: Participant
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants' })
  return (
    <Menu>
      <Button
        square
        variant="tertiaryText"
        size="sm"
        aria-label={t('moreOptions')}
        tooltip={t('moreOptions')}
      >
        <RiMore2Fill />
      </Button>
      <ParticipantMenu participant={participant} />
    </Menu>
  )
}
