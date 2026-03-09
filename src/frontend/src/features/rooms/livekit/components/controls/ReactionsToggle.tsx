import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { useState, useRef } from 'react'
import { css } from '@/styled-system/css'
import { useRoomContext } from '@livekit/components-react'
import { ToggleButton, Button } from '@/primitives'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationPayload } from '@/features/notifications/NotificationPayload'
import {
  ANIMATION_DURATION,
  ReactionPortals,
} from '@/features/rooms/livekit/components/ReactionPortal'
import { getEmojiLabel } from '@/features/rooms/livekit/utils/reactionUtils'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { FocusScope, useFocusManager } from '@react-aria/focus'
import useRateLimiter from '@/hooks/useRateLimiter'
import { layoutStore } from '@/stores/layout.ts'
import { useSnapshot } from 'valtio'
import { reactionsStore } from '@/stores/reaction.ts'

// eslint-disable-next-line react-refresh/only-export-components
export enum Emoji {
  THUMBS_UP = 'thumbs-up',
  THUMBS_DOWN = 'thumbs-down',
  CLAP = 'clapping-hands',
  HEART = 'red-heart',
  LAUGHING = 'face-with-tears-of-joy',
  SURPRISED = 'face-with-open-mouth',
  CELEBRATION = 'party-popper',
  PLEASE = 'folded-hands',
}

export interface Reaction {
  id: number
  emoji: string
  isLocalParticipant: boolean
  participantName: string
}

const getFirstControlBarFocusable = () =>
  document
    .getElementById('desktop-control-bar')
    ?.querySelector<HTMLButtonElement>('button:not([disabled])') ?? null

const ReactionButton = ({ emoji, debouncedSendReaction, index }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const focusManager = useFocusManager()
  let onKeyDown = (e) => {
    console.log(e)

    switch (e.key) {
      case 'ArrowRight':
        focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        focusManager?.focusPrevious({ wrap: true })
        break
      case 'Escape':
        layoutStore.showReaction = false
        break
      case 'Tab':
        console.log(getFirstControlBarFocusable)
        if (!e.shiftKey) getFirstControlBarFocusable()?.focus()
        break
    }
  }

  return (
    <Button
      onPress={() => debouncedSendReaction(emoji)}
      onKeyDown={onKeyDown}
      aria-label={t('send', { emoji: getEmojiLabel(emoji, t) })}
      variant="primaryTextDark"
      size="sm"
      square
      round
      tabIndex={index != 0 && -1}
      data-attr={`send-reaction-${emoji}`}
    >
      <img
        src={`/assets/reactions/${emoji}.png`}
        alt=""
        className={css({
          width: '28px',
          height: '28px',
          pointerEvents: 'none',
          userSelect: 'none',
        })}
      />
    </Button>
  )
}

const ForceFocusFirst = (props) => {
  const focusManager = useFocusManager()

  return (
    <div
      className={css({
        display: 'flex',
        gap: '0.2rem',
      })}
      onFocus={(e) => {
        // Only trigger when focus enters from outside this div
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          const w = focusManager?.focusFirst()
        }
      }}
    >
      {props.children}
    </div>
  )
}

const Toolbar = (props) => {
  return (
    <div
      role="toolbar"
      className={css({
        display: 'flex',
        borderRadius: '20px',
        padding: '0.15rem',

        backgroundColor: 'primaryDark.100',
        '&[data-entering]': {
          animation: 'fade 200ms ease',
        },
        '&[data-exiting]': {
          animation: 'fade 200ms ease-in reverse',
        },
        '@media (min-width: 610px)': {
          marginRight: '59px',
        },
      })}
    >
      <FocusScope autoFocus>
        <ForceFocusFirst>{props.children}</ForceFocusFirst>
      </FocusScope>
    </div>
  )
}

export const ReactionToolbar = () => {
  const instanceIdRef = useRef(0)
  const room = useRoomContext()

  const sendReaction = async (emoji: string) => {
    const encoder = new TextEncoder()
    const payload: NotificationPayload = {
      type: NotificationType.ReactionReceived,
      data: {
        emoji: emoji,
      },
    }
    const data = encoder.encode(JSON.stringify(payload))
    await room.localParticipant.publishData(data, { reliable: true })

    const newReaction = {
      id: `local-${instanceIdRef.current++}`,
      emoji,
      isLocalParticipant: room.localParticipant.isLocal,
      participantName: room.localParticipant.name,
    }

    reactionsStore.reactions.push(newReaction)

    // Remove this reaction after animation
    setTimeout(() => {
      const index = reactionsStore.reactions.findIndex(
        (r) => r.id === newReaction.id
      )
      if (index !== -1) reactionsStore.reactions.splice(index, 1)
    }, ANIMATION_DURATION)
  }

  const debouncedSendReaction = useRateLimiter({
    callback: sendReaction,
    maxCalls: 10,
    windowMs: 1000,
  })

  return (
    <div>
      <Toolbar>
        {Object.values(Emoji).map((emoji, index) => (
          <ReactionButton
            key={index}
            index={index}
            emoji={emoji}
            debouncedSendReaction={debouncedSendReaction}
          />
        ))}
      </Toolbar>
    </div>
  )
}

export const ReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })

  const layoutSnap = useSnapshot(layoutStore)

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: () => (layoutStore.showReaction = !layoutSnap.showReaction),
  })

  return (
    <>
      <div className={css({ position: 'relative' })}>
        <ToggleButton
          square
          variant="primaryDark"
          aria-label={t('button')}
          tooltip={t('button')}
          isSelected={layoutSnap.showReaction}
          onChange={() => {
            layoutStore.showReaction = !layoutSnap.showReaction
          }}
        >
          <RiEmotionLine />
        </ToggleButton>
      </div>
      <ReactionPortals />
    </>
  )
}
