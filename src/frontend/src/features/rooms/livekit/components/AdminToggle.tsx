import { ToggleButton } from '@/primitives'
import { RiAdminLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useIsAdminOrOwner } from '../hooks/useIsAdminOrOwner'
import { useSidePanel } from '../hooks/useSidePanel'

export const AdminToggle = ({
  variant = 'primaryTextDark',
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.admin' })

  const { isAdminOpen, toggleAdmin } = useSidePanel()
  const tooltipLabel = isAdminOpen ? 'open' : 'closed'

  const hasAdminAccess = useIsAdminOrOwner()
  if (!hasAdminAccess) return

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <ToggleButton
        square
        variant={variant}
        aria-label={t(tooltipLabel)}
        tooltip={t(tooltipLabel)}
        isSelected={isAdminOpen}
        onPress={(e) => {
          toggleAdmin()
          onPress?.(e)
        }}
        {...props}
      >
        <RiAdminLine />
      </ToggleButton>
    </div>
  )
}
