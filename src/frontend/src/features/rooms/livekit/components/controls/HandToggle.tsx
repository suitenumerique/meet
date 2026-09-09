import { useTranslation } from 'react-i18next'
import { RiHand } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { css } from '@/styled-system/css'
import { useRoomContext } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { type ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'

type Props = Pick<NonNullable<ButtonRecipeProps>, 'variant'> & ToggleButtonProps

export const HandToggle = ({
  variant = 'primaryDark',
  onPress,
  ...props
}: Props) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.hand' })

  const room = useRoomContext()
  const { isHandRaised, toggleRaisedHand } = useRaisedHand({
    participant: room.localParticipant,
  })

  useRegisterKeyboardShortcut({
    id: 'raise-hand',
    handler: toggleRaisedHand,
  })

  const tooltipLabel = isHandRaised ? 'lower' : 'raise'

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <ToggleButton
        {...props}
        square
        variant={variant}
        aria-label={t(tooltipLabel)}
        tooltip={t(tooltipLabel)}
        isSelected={isHandRaised}
        onPress={(e) => {
          toggleRaisedHand()
          onPress?.(e)
        }}
        data-attr={`controls-hand-${tooltipLabel}`}
      >
        <RiHand />
      </ToggleButton>
    </div>
  )
}
