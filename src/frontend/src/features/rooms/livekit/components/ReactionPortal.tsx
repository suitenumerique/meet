import { createPortal } from 'react-dom'
import { useState, useEffect, useMemo } from 'react'
import { Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Participant } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { Reaction } from '@/features/rooms/livekit/components/controls/ReactionsToggle'

export const ANIMATION_DURATION = 3000
export const ANIMATION_DISTANCE = 300
export const FADE_OUT_THRESHOLD = 0.7
export const REACTION_SPAWN_WIDTH_RATIO = 0.2
export const INITIAL_POSITION = 200

interface FloatingReactionProps {
  emoji: string
  name?: string
  speed?: number
  scale?: number
}

export function FloatingReaction({
  emoji,
  name,
  speed = 1,
  scale = 1,
}: FloatingReactionProps) {
  const [deltaY, setDeltaY] = useState(0)
  const [opacity, setOpacity] = useState(1)

  const left = useMemo(
    () => Math.random() * window.innerWidth * REACTION_SPAWN_WIDTH_RATIO,
    []
  )

  useEffect(() => {
    let start: number | null = null
    function animate(timestamp: number) {
      if (start === null) start = timestamp
      const elapsed = timestamp - start
      if (elapsed < 0) {
        setOpacity(0)
      } else {
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1)
        const distance = ANIMATION_DISTANCE * speed
        const newY = progress * distance
        setDeltaY(newY)
        if (progress > FADE_OUT_THRESHOLD) {
          setOpacity(1 - (progress - FADE_OUT_THRESHOLD) / 0.3)
        }
      }
      if (elapsed < ANIMATION_DURATION) {
        requestAnimationFrame(animate)
      }
    }
    const req = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(req)
  }, [speed])

  return (
    <div
      className={css({
        fontSize: '3rem',
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
      })}
      style={{
        left: left,
        bottom: INITIAL_POSITION + deltaY,
        transform: `scale(${scale})`,
        opacity: opacity,
      }}
    >
      <span
        className={css({
          lineHeight: '45px',
        })}
      >
        {emoji}
      </span>
      {name && (
        <Text
          variant="sm"
          className={css({
            backgroundColor: 'primaryDark.100',
            color: 'white',
            textAlign: 'center',
            borderRadius: '20px',
            paddingX: '0.5rem',
            paddingY: '0.15rem',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            lineHeight: '14px',
          })}
        >
          {name}
        </Text>
      )}
    </div>
  )
}

export function ReactionPortal({
  emoji,
  participant,
}: {
  emoji: string
  participant: Participant
}) {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const speed = useMemo(() => Math.random() * 1.5 + 0.5, [])
  const scale = useMemo(() => Math.max(Math.random() + 0.5, 1), [])
  return createPortal(
    <div
      className={css({
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      })}
    >
      <FloatingReaction
        emoji={emoji}
        speed={speed}
        scale={scale}
        name={participant?.isLocal ? t('you') : participant.name}
      />
    </div>,
    document.body
  )
}

export const ReactionPortals = ({ reactions }: { reactions: Reaction[] }) =>
  reactions.map((instance) => (
    <ReactionPortal
      key={instance.id}
      emoji={instance.emoji}
      participant={instance.participant}
    />
  ))
