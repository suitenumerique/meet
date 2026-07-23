import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { FocusButton } from './FocusButton'
import { EffectsButton } from './EffectsButton'
import { MuteButton } from './MuteButton'
import { ZoomButton } from './ZoomButton'

const MOUSE_IDLE_TIME = 3000

type FadeOverlayProps = {
  children: ReactNode
  hasKeyboardFocus: boolean
}

const FadeOverlay = ({ children, hasKeyboardFocus }: FadeOverlayProps) => {
  const [active, setActive] = useState(false)
  const idleTimerRef = useRef<number | null>(null)

  const clearIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
  }

  const armIdleTimer = () => {
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      setActive(false)
    }, MOUSE_IDLE_TIME)
  }

  const handleActivity = () => {
    setActive(true)
    armIdleTimer()
  }

  useEffect(() => clearIdleTimer, [])

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
      })}
      data-visible={isVisible || undefined}
      aria-hidden={!isVisible}
      onMouseEnter={handleActivity}
      onMouseMove={handleActivity}
      onMouseLeave={() => {
        clearIdleTimer()
        setActive(false)
      }}
    >
      {isVisible && children}
    </div>
  )
}

export const ParticipantTileFocus = ({
  trackRef,
  hasKeyboardFocus,
}: {
  trackRef: TrackReferenceOrPlaceholder
  hasKeyboardFocus: boolean
}) => {
  const participant = trackRef.participant
  const isScreenShare = trackRef.source == Track.Source.ScreenShare
  const isLocal = participant.isLocal
  const canMute = useCanMute(participant)

  return (
    <FadeOverlay hasKeyboardFocus={hasKeyboardFocus}>
      <div
        className={css({
          backgroundColor: 'primaryDark.50',
          zIndex: 1,
          borderRadius: '0.25rem',
          display: 'flex',
          opacity: 0.6,
          animation: 'overlayIn 200ms linear 300ms backwards',
          _hover: {
            opacity: 0.95,
          },
        })}
      >
        <HStack gap={0.5} padding={0.5}>
          <FocusButton trackRef={trackRef} />
          {!isScreenShare ? (
            <>
              {isLocal ? (
                <EffectsButton />
              ) : (
                canMute && <MuteButton participant={participant} />
              )}
            </>
          ) : (
            !isLocal && <ZoomButton trackRef={trackRef} />
          )}
        </HStack>
      </div>
    </FadeOverlay>
  )
}
