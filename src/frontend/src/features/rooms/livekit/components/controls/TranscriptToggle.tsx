import { ToggleButton } from '@/primitives'
import { RiBardLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useSidePanel } from '../../hooks/useSidePanel'
import { useHasTranscriptAccess } from '../../hooks/useHasTranscriptAccess'
import { css } from '@/styled-system/css'
import { ToggleButtonProps } from '@/primitives/ToggleButton'

export const TranscriptToggle = ({
  variant = 'primaryTextDark',
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.transcript' })

  const { isTranscriptOpen, toggleTranscript } = useSidePanel()
  const tooltipLabel = isTranscriptOpen ? 'open' : 'closed'

  const hasTranscriptAccess = useHasTranscriptAccess()

  if (!hasTranscriptAccess) return

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
        isSelected={isTranscriptOpen}
        onPress={(e) => {
          toggleTranscript()
          onPress?.(e)
        }}
        {...props}
        data-attr="toggle-transcript"
      >
        <RiBardLine />
      </ToggleButton>
    </div>
  )
}
