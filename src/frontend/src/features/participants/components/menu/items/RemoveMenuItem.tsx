import React from 'react'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { MenuItem } from 'react-aria-components'
import { useRemoveParticipant } from '@/features/rooms/api/removeParticipant'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/primitives/Icon'

type RemoveMenuItemProps = {
  identity: string
  displayedName?: string
}

export const RemoveMenuItem = React.memo(
  ({ identity, displayedName }: RemoveMenuItemProps) => {
    const { t } = useTranslation('rooms', {
      keyPrefix: 'participantMenu.remove',
    })
    const { removeParticipant } = useRemoveParticipant()
    return (
      <MenuItem
        aria-label={t('ariaLabel', { name: displayedName || identity })}
        className={menuRecipe({ icon: true }).item}
        onAction={() => removeParticipant(identity)}
      >
        <HStack gap="3xs">
          <Icon name="x-mark" size={20} />
          {t('label')}
        </HStack>
      </MenuItem>
    )
  }
)

RemoveMenuItem.displayName = 'RemoveMenuItem'
