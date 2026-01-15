import { useCallback } from 'react'
import { ToggleButton } from '@/primitives'
import { RiAdminLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useIsAdminOrOwner } from '../hooks/useIsAdminOrOwner'
import { useSidePanel } from '../hooks/useSidePanel'
import { useSidePanelTriggers } from '../hooks/useSidePanelTriggers'

export const AdminToggle = ({
  variant = 'primaryTextDark',
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.admin' })

  const { isAdminOpen, toggleAdmin } = useSidePanel()
  const { setTrigger } = useSidePanelTriggers()
  const tooltipLabel = isAdminOpen ? 'open' : 'closed'
  const setAdminTriggerRef = useCallback(
    (el: HTMLElement | null) => {
      setTrigger('admin', el)
    },
    [setTrigger]
  )

  const hasAdminAccess = useIsAdminOrOwner()
  if (!hasAdminAccess) return null

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
        ref={setAdminTriggerRef}
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
