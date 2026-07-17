import { useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { RiGroupLine } from '@remixicon/react'
import { ToggleButton, type ToggleButtonProps } from '@/primitives/ToggleButton'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { css } from '@/styled-system/css'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { ParticipantsCount } from '@/features/participants/components/ParticipantsCount'

const containerStyles = css({ position: 'relative', display: 'inline-block' })

export const ParticipantsToggle = ({
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.participants' })
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()
  const countId = useId()

  const tooltipLabel = isParticipantsOpen ? 'open' : 'closed'

  useRegisterKeyboardShortcut({
    id: 'toggle-participants',
    handler: toggleParticipants,
  })

  const handlePress = useCallback(
    (e: Parameters<NonNullable<ToggleButtonProps['onPress']>>[0]) => {
      toggleParticipants()
      onPress?.(e)
    },
    [toggleParticipants, onPress]
  )

  return (
    <div className={containerStyles}>
      <VisualOnlyTooltip tooltip={t(tooltipLabel)}>
        <ToggleButton
          square
          variant="primaryTextDark"
          aria-label={t(tooltipLabel)}
          aria-describedby={countId}
          isSelected={isParticipantsOpen}
          aria-expanded={isParticipantsOpen}
          onPress={handlePress}
          data-attr={`controls-participants-${tooltipLabel}`}
          {...props}
        >
          <RiGroupLine />
        </ToggleButton>
      </VisualOnlyTooltip>
      <ParticipantsCount describedById={countId} />
    </div>
  )
}
