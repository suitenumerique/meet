import { useIsSpeaking, useRoomContext } from '@livekit/components-react'
import { useEffect, useState } from 'react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import {
  closeLowerHandToasts,
  showLowerHandToast,
} from '@/features/notifications/utils'

const SPEAKING_DETECTION_DELAY = 3000

/**
 * Offers to lower the local participant's raised hand once they have been
 * speaking for SPEAKING_DETECTION_DELAY.
 *
 * Mounted once beside the room rather than inside HandToggle: the
 * picture-in-picture window draws a second control bar, so a second copy of
 * the button would run a second timer, and the offer the user dismissed on one
 * toast would still be honoured by the other.
 */
export const LowerHandOnSpeaking = () => {
  const room = useRoomContext()
  const { isHandRaised, lowerHand } = useRaisedHand({
    participant: room.localParticipant,
  })
  const isSpeaking = useIsSpeaking(room.localParticipant)
  const [hasOffered, setHasOffered] = useState(false)

  useEffect(() => {
    if (isHandRaised) return
    setHasOffered(false)
    closeLowerHandToasts()
  }, [isHandRaised])

  useEffect(() => {
    if (!isSpeaking || !isHandRaised || hasOffered) return

    const timer = setTimeout(() => {
      setHasOffered(true)
      showLowerHandToast(room.localParticipant, lowerHand)
    }, SPEAKING_DETECTION_DELAY)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isHandRaised, hasOffered])

  return null
}
