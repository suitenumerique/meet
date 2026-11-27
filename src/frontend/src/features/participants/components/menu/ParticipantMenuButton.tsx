import { Button, Menu, Icon } from '@/primitives'
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
    <Menu dropdown>
      <Button
        square
        variant="tertiaryNeutral"
        size="sm"
        aria-label={t('moreOptions')}
        tooltip={t('moreOptions')}
      >
        <Icon name="more-vertical" />
      </Button>
      <ParticipantMenu participant={participant} />
    </Menu>
  )
}
