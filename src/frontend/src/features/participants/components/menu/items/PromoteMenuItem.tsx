import React, { useCallback } from 'react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { RiAdminLine, RiUserMinusLine } from '@remixicon/react'
import { useParticipantRole } from '@/features/participants/api/updateParticipantRole'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'

type PromoteMenuItemProps = {
  identity: string
  displayedName?: string
  isAdmin: boolean
}

export const PromoteMenuItem = React.memo(
  ({ identity, displayedName, isAdmin }: PromoteMenuItemProps) => {
    const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu' })

    const { updateParticipantRole } = useParticipantRole()

    const label = isAdmin ? 'demote' : 'promote'
    const Icon = isAdmin ? RiUserMinusLine : RiAdminLine

    const toggleRole = useCallback(
      () =>
        updateParticipantRole(identity, isAdmin ? 'member' : 'administrator'),
      [isAdmin, updateParticipantRole, identity]
    )

    return (
      <MenuItem
        aria-label={t(`${label}.ariaLabel`, {
          name: displayedName || identity,
        })}
        className={menuRecipe({ icon: true }).item}
        onAction={toggleRole}
      >
        <HStack gap={0.25} minWidth={280}>
          <Icon size={20} aria-hidden />
          {t(`${label}.label`)}
        </HStack>
      </MenuItem>
    )
  }
)

PromoteMenuItem.displayName = 'PromoteMenuItem'
