import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { FocusButton } from './FocusButton'
import { EffectsButton } from './EffectsButton'
import { MuteButton } from './MuteButton'

const MOUSE_IDLE_TIME = 3000

type FadeOverlayProps = {
  children: ReactNode
  hasKeyboardFocus: boolean
  tileRef: React.RefObject<HTMLDivElement | null>
}

// Pointer-events none so this overlay doesn't block the zoom surface below.
// The tile node still gets the mouse events, so we listen on it directly
// rather than lifting the state up: this keeps mouse moves from re-rendering
// the tile and the video it contains.
const FadeOverlay = ({
  children,
  hasKeyboardFocus,
  tileRef,
}: FadeOverlayProps) => {
  const [active, setActive] = useState(false)
  const idleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return

    const clearIdleTimer = () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    const handleActivity = () => {
      setActive(true)
      clearIdleTimer()
      idleTimerRef.current = window.setTimeout(
        () => setActive(false),
        MOUSE_IDLE_TIME
      )
    }

    const handleLeave = () => {
      clearIdleTimer()
      setActive(false)
    }

    tile.addEventListener('mouseenter', handleActivity)
    tile.addEventListener('mousemove', handleActivity)
    tile.addEventListener('mouseleave', handleLeave)

    return () => {
      clearIdleTimer()
      tile.removeEventListener('mouseenter', handleActivity)
      tile.removeEventListener('mousemove', handleActivity)
      tile.removeEventListener('mouseleave', handleLeave)
    }
  }, [tileRef])

  const isVisible = hasKeyboardFocus || active

  return (
    <div
      className={css({
        position: 'absolute',
        left: '0',
        top: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      })}
      data-visible={isVisible || undefined}
      aria-hidden={!isVisible}
    >
      {isVisible && children}
    </div>
  )
}

export const ParticipantTileFocus = ({
  trackRef,
  tileRef,
  hasKeyboardFocus,
}: {
  trackRef: TrackReferenceOrPlaceholder
  tileRef: React.RefObject<HTMLDivElement | null>
  hasKeyboardFocus: boolean
}) => {
  const participant = trackRef.participant
  const isScreenShare = trackRef.source == Track.Source.ScreenShare
  const isLocal = participant.isLocal
  const canMute = useCanMute(participant)

  return (
    <FadeOverlay hasKeyboardFocus={hasKeyboardFocus} tileRef={tileRef}>
      <div
        className={css({
          backgroundColor: 'primaryDark.50',
          zIndex: 1,
          borderRadius: '0.25rem',
          display: 'flex',
          opacity: 0.6,
          animation: 'overlayIn 200ms linear 300ms backwards',
          pointerEvents: 'auto',
          _hover: {
            opacity: 0.95,
          },
        })}
      >
        <HStack gap={0.5} padding={0.5}>
          <FocusButton trackRef={trackRef} />
          {!isScreenShare && (
            <>
              {isLocal ? (
                <EffectsButton />
              ) : (
                canMute && <MuteButton participant={participant} />
              )}
            </>
          )}
        </HStack>
      </div>
    </FadeOverlay>
  )
}
