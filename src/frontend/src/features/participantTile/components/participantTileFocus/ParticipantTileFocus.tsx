import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { FocusButton } from './FocusButton'
import { EffectsButton } from './EffectsButton'
import { MuteButton } from './MuteButton'
import { ZoomButton } from './ZoomButton'

const MOUSE_IDLE_TIME = 3000

export const ParticipantTileFocus = ({
  trackRef,
  hasKeyboardFocus,
}: {
  trackRef: TrackReferenceOrPlaceholder
  hasKeyboardFocus: boolean
}) => {
  const [hovered, setHovered] = useState(false)
  const [opacity, setOpacity] = useState(0)

  const idleTimerRef = useRef<number | null>(null)
  const [isIdleRef, setIsIdleRef] = useState(false)

  const isVisible = hasKeyboardFocus || (hovered && !isIdleRef)

  useEffect(() => {
    if (isVisible) {
      // Wait for next frame to ensure element is mounted
      requestAnimationFrame(() => {
        setOpacity(0.6)
      })
    } else {
      setOpacity(0)
    }
  }, [isVisible])

  const handleMouseMove = () => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = window.setTimeout(() => {
      setIsIdleRef(true)
    }, MOUSE_IDLE_TIME)
    setIsIdleRef(false)
  }

  const participant = trackRef.participant

  const isScreenShare = trackRef.source == Track.Source.ScreenShare
  const isLocal = trackRef.participant.isLocal

  const canMute = useCanMute(participant)

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
      aria-hidden={!isVisible}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
    >
      {isVisible && (
        <div
          className={css({
            backgroundColor: 'primaryDark.50',
            transition: 'opacity 200ms linear',
            zIndex: 1,
            borderRadius: '0.25rem',
            display: 'flex',
            _hover: {
              opacity: '0.95 !important',
            },
          })}
          style={{ opacity }}
        >
          <HStack
            gap={0.5}
            className={css({
              padding: '0.5rem',
              _hover: {
                opacity: '1 !important',
              },
            })}
          >
            <FocusButton trackRef={trackRef} />
            {!isScreenShare ? (
              <>
                {participant.isLocal ? (
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
      )}
    </div>
  )
}
