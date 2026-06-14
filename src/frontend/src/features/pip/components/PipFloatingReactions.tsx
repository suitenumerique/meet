import { useSnapshot } from 'valtio'
import { reactionsStore } from '@/stores/reactions'
import { useRef, useState } from 'react'
import { FloatingReaction } from '@/features/reactions/components/ReactionPortals'
import { Reaction } from '@/features/reactions/types'
import { css } from '@/styled-system/css'

export const PipFloatingReactions = () => {
  const { reactions } = useSnapshot(reactionsStore)

  return (
    <>
      {reactions.map((reaction) => (
        <PipFloatingReaction key={reaction.id} reaction={reaction} />
      ))}
    </>
  )
}

const PipFloatingReaction = ({ reaction }: { reaction: Reaction }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [speed] = useState(() => Math.random() * 1.5 + 0.5)
  const [scale] = useState(() => Math.max(Math.random() + 0.5, 1))
  return (
    <div
      ref={containerRef}
      className={css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      })}
    >
      <FloatingReaction
        emoji={reaction.emoji}
        speed={speed}
        scale={scale}
        name={reaction.participantName}
        isLocal={reaction.isLocal}
      />
    </div>
  )
}
