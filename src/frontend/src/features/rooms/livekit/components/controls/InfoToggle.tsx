import { useTranslation } from 'react-i18next'
import { RiInformationLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { ToggleButton } from '@/primitives'
import { useSidePanel } from '../../hooks/useSidePanel'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useSidePanelTriggerRef } from '../../hooks/useSidePanelTriggerRef'

export const InfoToggle = ({
  onPress,
  ...props
}: Partial<ToggleButtonProps>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.info' })

  const { isInfoOpen, toggleInfo } = useSidePanel()
  const tooltipLabel = isInfoOpen ? 'open' : 'closed'
  const setInfoTriggerRef = useSidePanelTriggerRef('info')

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <ToggleButton
        square
        variant="primaryTextDark"
        aria-label={t(tooltipLabel)}
        tooltip={t(tooltipLabel)}
        isSelected={isInfoOpen}
        ref={setInfoTriggerRef}
        onPress={(e) => {
          toggleInfo()
          onPress?.(e)
        }}
        data-attr={`controls-info-${tooltipLabel}`}
        {...props}
      >
        <RiInformationLine />
      </ToggleButton>
    </div>
  )
}
