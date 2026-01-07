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

const srOnly = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})

const getEmojiLabel = (
  emoji: string,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const emojiLabels: Record<string, string> = {
    'thumbs-up': t('emojis.thumbs-up', { defaultValue: 'thumbs up' }),
    'thumbs-down': t('emojis.thumbs-down', { defaultValue: 'thumbs down' }),
    'clapping-hands': t('emojis.clapping-hands', {
      defaultValue: 'clapping hands',
    }),
    'red-heart': t('emojis.red-heart', { defaultValue: 'red heart' }),
    'face-with-tears-of-joy': t('emojis.face-with-tears-of-joy', {
      defaultValue: 'face with tears of joy',
    }),
    'face-with-open-mouth': t('emojis.face-with-open-mouth', {
      defaultValue: 'surprised face',
    }),
    'party-popper': t('emojis.party-popper', { defaultValue: 'party popper' }),
    'folded-hands': t('emojis.folded-hands', { defaultValue: 'folded hands' }),
  }
  return emojiLabels[emoji] ?? emoji
}

interface FloatingReactionProps {
  emoji: string
  name?: string
  isLocal?: boolean
  speed?: number
  scale?: number
}

export function FloatingReaction({
  emoji,
  name,
  isLocal = false,
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
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
      })}
      style={{
        left: left,
        bottom: INITIAL_POSITION + deltaY,
        opacity: opacity,
      }}
    >
      <img
        src={`/assets/reactions/${emoji}.png`}
        alt={''}
        className={css({
          height: '50px',
        })}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center bottom',
        }}
      />
      {name && (
        <Text
          variant="sm"
          className={css({
            backgroundColor: isLocal ? 'primary.100' : 'primaryDark.100',
            color: isLocal ? 'black' : 'white',
            fontWeight: 500,
            textAlign: 'center',
            borderRadius: '20px',
            paddingX: '0.5rem',
            paddingBottom: '0.3125rem',
            paddingTop: '0.15rem',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            lineHeight: '16px',
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
        isLocal={participant?.isLocal}
      />
    </div>,
    document.body
  )
}

export const ReactionPortals = ({ reactions }: { reactions: Reaction[] }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [lastAnnouncedId, setLastAnnouncedId] = useState<number | null>(null)

  const latestReaction =
    reactions.length > 0 ? reactions[reactions.length - 1] : undefined

  useEffect(() => {
    if (!latestReaction) return
    const isNewReaction = latestReaction.id !== lastAnnouncedId
    if (!isNewReaction) return

    const emojiLabel = getEmojiLabel(latestReaction.emoji, t)
    const participantName = latestReaction.participant?.isLocal
      ? t('you')
      : (latestReaction.participant?.name ?? '')
    setAnnouncement(t('announce', { name: participantName, emoji: emojiLabel }))
    setLastAnnouncedId(latestReaction.id)

    const timer = setTimeout(() => setAnnouncement(null), 1200)
    return () => clearTimeout(timer)
  }, [latestReaction, lastAnnouncedId, t])

  return (
    <>
      {reactions.map((instance) => (
        <ReactionPortal
          key={instance.id}
          emoji={instance.emoji}
          participant={instance.participant}
        />
      ))}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={srOnly}
      >
        {announcement ?? ''}
      </div>
    </>
  )
}
