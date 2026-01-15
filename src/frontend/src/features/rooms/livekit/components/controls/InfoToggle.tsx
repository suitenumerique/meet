import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RiInformationLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { ToggleButton } from '@/primitives'
import { useSidePanel } from '../../hooks/useSidePanel'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useSidePanelTriggers } from '../../hooks/useSidePanelTriggers'

export const InfoToggle = ({
  onPress,
  ...props
}: Partial<ToggleButtonProps>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.info' })

  const { isInfoOpen, toggleInfo } = useSidePanel()
  const { setTrigger } = useSidePanelTriggers()
  const tooltipLabel = isInfoOpen ? 'open' : 'closed'
  const setInfoTriggerRef = useCallback(
    (el: HTMLElement | null) => {
      setTrigger('info', el)
    },
    [setTrigger]
  )

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
