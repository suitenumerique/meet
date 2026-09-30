import { useIsSpeaking, useRoomContext } from '@livekit/components-react'
import { useEffect, useState } from 'react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import {
  closeLowerHandToasts,
  showLowerHandToast,
} from '@/features/notifications/utils'

const SPEAKING_DETECTION_DELAY = 3000

/**
 * Offers to lower the local participant's raised hand after
 * SPEAKING_DETECTION_DELAY of speaking. Mount it once: each copy runs its own
 * timer and shows its own toast.
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
