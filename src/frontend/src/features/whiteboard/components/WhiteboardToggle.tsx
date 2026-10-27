import { RiArtboardLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ToggleButton } from '@/primitives'
import type { ToggleButtonProps } from '@/primitives/ToggleButton'
import type { ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { useWhiteboard } from '../hooks/useWhiteboard'

type Props = Partial<ToggleButtonProps> & {
  variant?: ButtonRecipeProps['variant']
  onPress?: () => void
}

export const WhiteboardToggle = ({
  variant = 'primaryDark',
  onPress,
  ...props
}: Props) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.whiteboard' })
  const { isOpen, toggleWhiteboard, isWhiteboardAllowed } = useWhiteboard()
  const tooltipLabel = isOpen ? 'stop' : 'start'

  return (
    <ToggleButton
      isSelected={isOpen}
      isDisabled={!isWhiteboardAllowed || props.isDisabled}
      square
      variant={variant}
      aria-label={t(tooltipLabel)}
      tooltip={!isWhiteboardAllowed ? t('disabled') : t(tooltipLabel)}
      onPress={() => {
        toggleWhiteboard()
        onPress?.()
      }}
      data-attr={`controls-whiteboard-${tooltipLabel}`}
      {...props}
    >
      <RiArtboardLine size={24} />
    </ToggleButton>
  )
}
