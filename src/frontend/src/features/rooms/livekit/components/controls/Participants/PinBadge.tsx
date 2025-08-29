import { useFocusToggleParticipant } from '@/features/rooms/livekit/hooks/useFocusToggleParticipant'
import { Participant } from 'livekit-client'
import { RiPushpin2Fill } from '@remixicon/react'
import { css } from '@/styled-system/css'

export const PinBadge = ({ participant }: { participant: Participant }) => {
  const { inFocus } = useFocusToggleParticipant(participant)

  if (!inFocus) return

  return (
    <div
      className={css({
        height: '18px',
        width: '18px',
        borderRadius: '100%',
        background: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: '-2px',
        right: '-4px',
      })}
    >
      <RiPushpin2Fill size={14} aria-hidden />
    </div>
  )
}
