import React, { ReactNode, RefObject, useEffect, useRef } from 'react'
import {
  useRaisedHand,
  useRaisedHandPosition,
} from '@/features/rooms/livekit/hooks/useRaisedHand'
import { Participant } from 'livekit-client'
import { css } from '@/styled-system/css'
import { Icon } from '@/primitives/Icon'

const PositionInQueue = React.memo(
  ({
    positionInQueue,
    showPosition,
  }: {
    positionInQueue?: number
    showPosition: boolean
  }) => {
    if (!positionInQueue) return
    return (
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.1rem' }}
      >
        {showPosition && <span>{positionInQueue}</span>}
        <Icon
          name="hand"
          size={16}
          style={{
            color: 'black',
            marginRight: '0.4rem',
            marginLeft: '0.1rem',
            minWidth: '16px',
            animationDuration: '300ms',
            animationName: 'wave_hand',
            animationIterationCount: '2',
          }}
        />
      </span>
    )
  }
)

PositionInQueue.displayName = 'PositionInQueue'

const RaisedHandActiveItem = ({
  participant,
  targetRef,
}: {
  participant: Participant
  targetRef: RefObject<HTMLElement | null>
}) => {
  const { positionInQueue, firstInQueue, queueLength } = useRaisedHandPosition({
    participant,
  })
  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    el.style.backgroundColor = firstInQueue ? '#fde047' : 'white'
    el.style.color = 'black'
    el.style.borderColor = 'transparent'

    return () => {
      el.style.backgroundColor = ''
      el.style.color = ''
      el.style.borderColor = ''
    }
  }, [targetRef, firstInQueue])

  return (
    <PositionInQueue
      positionInQueue={positionInQueue}
      showPosition={queueLength > 1}
    />
  )
}

export const RaisedHandMetadataWrapper = ({
  participant,
  enabled = true,
  children,
}: {
  participant: Participant
  enabled?: boolean
  children: ReactNode
}) => {
  const ref = useRef(null)

  const { isHandRaised } = useRaisedHand({ participant })
  const showHand = isHandRaised && enabled

  return (
    <div
      ref={ref}
      className={css({
        display: 'flex',
        alignItems: 'center',
        minWidth: 0,
        height: 'var(--metadata-item-size)',
        paddingX: '0.375rem',
        color: 'content.semantic.neutral.secondary',
        backgroundColor: 'background.surface.tertiary',
        border: '1px solid',
        borderColor: 'border.surface.primary',
        borderRadius: '4px',
        transition: 'background 200ms ease',
      })}
    >
      {showHand && (
        <RaisedHandActiveItem participant={participant} targetRef={ref} />
      )}
      {children}
    </div>
  )
}
