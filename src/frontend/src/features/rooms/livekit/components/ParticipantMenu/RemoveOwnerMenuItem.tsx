import { Participant } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { RiShieldLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useDemoteParticipant } from '@/features/rooms/api/demoteParticipant'
import { useTranslation } from 'react-i18next'

export const RemoveOwnerMenuItem = ({
  participant,
}: {
  participant: Participant
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu.removeOwner' })
  const { demoteParticipant } = useDemoteParticipant()

  return (
    <MenuItem
      aria-label={t('ariaLabel', { name: participant.name })}
      className={menuRecipe({ icon: true }).item}
      onAction={() => demoteParticipant(participant)}
    >
      <HStack gap={0.25}>
        <RiShieldLine size={20} aria-hidden />
        {t('label')}
      </HStack>
    </MenuItem>
  )
}
