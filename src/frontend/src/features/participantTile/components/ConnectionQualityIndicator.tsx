import { useConnectionQualityIndicator } from '@livekit/components-react'
import { ConnectionQuality, type Participant } from 'livekit-client'
import { css } from '@/styled-system/css'

const BARS = [
  { x: 1, y: 10, height: 5 },
  { x: 6, y: 6, height: 9 },
  { x: 11, y: 1, height: 14 },
]

const LIT_BARS: Partial<Record<ConnectionQuality, number>> = {
  [ConnectionQuality.Excellent]: 3,
  [ConnectionQuality.Good]: 2,
  [ConnectionQuality.Poor]: 1,
}

/**
 * Connection quality of a participant, shown while their tile is hovered
 * or focused.
 *
 * Tiles are always dark, so the colors are the dark values of the UI kit
 * tokens named in the comments.
 */
export const ConnectionQualityIndicator = ({
  participant,
}: {
  participant: Participant
}) => {
  const { quality } = useConnectionQualityIndicator({ participant })
  const litBars = LIT_BARS[quality] ?? 0

  return (
    <div
      data-quality={quality}
      aria-hidden="true"
      className={css({
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--metadata-item-size)',
        height: 'var(--metadata-item-size)',
        color: 'content.semantic.neutral.secondary',
        backgroundColor: 'background.surface.tertiary',
        border: '1px solid',
        borderColor: 'border.surface.primary',
        borderRadius: '4px',
        opacity: 0,
        transition: 'opacity 200ms ease-in-out 200ms',
        '.lk-participant-tile:hover &, .lk-participant-tile:focus &': {
          opacity: 1,
          transitionDelay: '0s',
        },
      })}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        {BARS.map((bar, index) => (
          <rect
            key={bar.x}
            {...bar}
            width="3"
            rx="1"
            opacity={index < litBars ? 1 : 0.3}
          />
        ))}
      </svg>
    </div>
  )
}
