import { Participant } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { RiCloseLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useRemoveParticipant } from '@/features/rooms/api/removeParticipant'
import { useTranslation } from 'react-i18next'

export const RemoveMenuItem = ({
  participant,
}: {
  participant: Participant
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu.remove' })
  const { removeParticipant } = useRemoveParticipant()
  return (
    <MenuItem
      aria-label={t('ariaLabel', { name: participant.name })}
      className={menuRecipe({ icon: true }).item}
      onAction={() => removeParticipant(participant)}
    >
      <HStack gap={0.25}>
        <RiCloseLine size={20} aria-hidden />
        {t('label')}
      </HStack>
    </MenuItem>
  )
}
