import { Participant } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { RiShieldUserLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { usePromoteParticipant } from '@/features/rooms/api/promoteParticipant'
import { useTranslation } from 'react-i18next'

export const MakeOwnerMenuItem = ({
  participant,
}: {
  participant: Participant
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu.makeOwner' })
  const { promoteParticipant } = usePromoteParticipant()

  return (
    <MenuItem
      aria-label={t('ariaLabel', { name: participant.name })}
      className={menuRecipe({ icon: true }).item}
      onAction={() => promoteParticipant(participant)}
    >
      <HStack gap={0.25}>
        <RiShieldUserLine size={20} aria-hidden />
        {t('label')}
      </HStack>
    </MenuItem>
  )
}
