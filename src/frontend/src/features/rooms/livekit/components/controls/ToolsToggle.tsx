import { ToggleButton } from '@/primitives'
import { RiShapesLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useSidePanel } from '../../hooks/useSidePanel'
import { css } from '@/styled-system/css'
import { ToggleButtonProps } from '@/primitives/ToggleButton'

export const ToolsToggle = ({
  variant = 'primaryTextDark',
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.tools' })

  const { isToolsOpen, toggleTools } = useSidePanel()
  const tooltipLabel = isToolsOpen ? 'open' : 'closed'

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
        isSelected={isToolsOpen}
        onPress={(e) => {
          toggleTools()
          onPress?.(e)
        }}
        {...props}
        data-attr="toggle-tools"
      >
        <RiShapesLine />
      </ToggleButton>
    </div>
  )
}
