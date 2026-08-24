import { useTranslation } from 'react-i18next'
import { RiHand } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { css } from '@/styled-system/css'
import { useRoomContext } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useEffect, useRef, useState } from 'react'
import {
  closeLowerHandToasts,
  showLowerHandToast,
} from '@/features/notifications/utils'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { type ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'

const SPEAKING_DETECTION_DELAY = 3000

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

  const isSpeaking = room.localParticipant.isSpeaking
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasShownToast, setHasShownToast] = useState(false)

  const resetToastState = () => {
    setHasShownToast(false)
  }

  useEffect(() => {
    if (isHandRaised) return
    closeLowerHandToasts()
  }, [isHandRaised])

  const handleToggle = () => {
    toggleRaisedHand()
    resetToastState()
  }

  useRegisterKeyboardShortcut({
    id: 'raise-hand',
    handler: handleToggle,
  })

  useEffect(() => {
    const shouldShowToast = isSpeaking && isHandRaised && !hasShownToast

    if (shouldShowToast && !speakingTimerRef.current) {
      speakingTimerRef.current = setTimeout(() => {
        setHasShownToast(true)
        const onClose = () => {
          if (isHandRaised) toggleRaisedHand()
          resetToastState()
        }
        showLowerHandToast(room.localParticipant, onClose)
      }, SPEAKING_DETECTION_DELAY)
    }
    if ((!isSpeaking || !isHandRaised) && speakingTimerRef.current) {
      clearTimeout(speakingTimerRef.current)
      speakingTimerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isHandRaised, hasShownToast, toggleRaisedHand])

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
          handleToggle()
          onPress?.(e)
        }}
        data-attr={`controls-hand-${tooltipLabel}`}
      >
        <RiHand />
      </ToggleButton>
    </div>
  )
}
