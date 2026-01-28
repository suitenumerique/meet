import { useTranslation } from 'react-i18next'
import { RiGroupLine, RiInfinityLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { css } from '@/styled-system/css'
import { useParticipants } from '@livekit/components-react'
import { useSidePanel } from '../../../hooks/useSidePanel'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

export const ParticipantsToggle = ({
  onPress,
  ...props
}: ToggleButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.participants' })

  /**
   * Context could not be used due to inconsistent refresh behavior.
   * The 'numParticipant' property on the room only updates when the room's metadata changes,
   * resulting in a delay compared to the participant list's actual refresh rate.
   */
  const participants = useParticipants()
  const numParticipants = participants?.length
  const announcedCount =
    numParticipants && numParticipants > 0 ? numParticipants : 1

  const { isParticipantsOpen, toggleParticipants } = useSidePanel()

  const tooltipLabel = isParticipantsOpen ? 'open' : 'closed'

  useRegisterKeyboardShortcut({
    shortcutId: 'toggle-participants',
    handler: toggleParticipants,
  })

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <VisualOnlyTooltip tooltip={t(tooltipLabel)}>
        <ToggleButton
          square
          variant="primaryTextDark"
          aria-label={`${t(tooltipLabel)}. ${t('count', {
            count: announcedCount,
          })}.`}
          isSelected={isParticipantsOpen}
          onPress={(e) => {
            toggleParticipants()
            onPress?.(e)
          }}
          data-attr={`controls-participants-${tooltipLabel}`}
          {...props}
        >
          <RiGroupLine />
        </ToggleButton>
      </VisualOnlyTooltip>
      <div
        className={css({
          position: 'absolute',
          top: '-.25rem',
          right: '-.25rem',
          width: '1.25rem',
          height: '1.25rem',
          backgroundColor: 'gray',
          borderRadius: '50%',
          color: 'white',
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          zIndex: 1,
          userSelect: 'none',
        })}
      >
        {numParticipants < 100 ? (
          numParticipants || 1
        ) : (
          <RiInfinityLine size={10} />
        )}
      </div>
    </div>
  )
}
