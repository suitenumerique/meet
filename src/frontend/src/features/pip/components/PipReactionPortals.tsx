import { useMemo, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { reactionsStore } from '@/stores/reactions'
import { FloatingReaction } from '@/features/reactions/components/ReactionPortals'
import type { Reaction } from '@/features/reactions/types'

/**
 * Renders floating emoji reactions inside the PiP window.
 * Reads the same shared reactionsStore used by the main window.
 */
export const PipReactionPortals = () => {
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
  const speed = useMemo(() => Math.random() * 1.5 + 0.5, [])
  const scale = useMemo(() => Math.max(Math.random() + 0.5, 1), [])

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
