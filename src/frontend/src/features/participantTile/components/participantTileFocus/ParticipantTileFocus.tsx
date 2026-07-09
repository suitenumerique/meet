import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { ReactNode } from 'react'
import { Track } from 'livekit-client'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { FocusButton } from './FocusButton'
import { EffectsButton } from './EffectsButton'
import { MuteButton } from './MuteButton'

type FadeOverlayProps = {
  children: ReactNode
  isVisible: boolean
}

// Pointer-events none so this overlay doesn't block the zoom surface below.
// Hover and idle tracking therefore lives on the tile, which still receives
// the pointer events, and comes back in as isVisible.
const FadeOverlay = ({ children, isVisible }: FadeOverlayProps) => {
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
  isVisible,
}: {
  trackRef: TrackReferenceOrPlaceholder
  isVisible: boolean
}) => {
  const participant = trackRef.participant
  const isScreenShare = trackRef.source == Track.Source.ScreenShare
  const isLocal = participant.isLocal
  const canMute = useCanMute(participant)

  return (
    <FadeOverlay isVisible={isVisible}>
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
