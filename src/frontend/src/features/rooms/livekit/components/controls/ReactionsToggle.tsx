import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { useState, useRef, useEffect } from 'react'
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
import { Toolbar as RACToolbar } from 'react-aria-components'
import { Participant } from 'livekit-client'
import useRateLimiter from '@/hooks/useRateLimiter'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

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
  participant: Participant
}

export const ReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const [reactions, setReactions] = useState<Reaction[]>([])
  const instanceIdRef = useRef(0)
  const room = useRoomContext()

  const [isVisible, setIsVisible] = useState(false)

  useRegisterKeyboardShortcut({
    shortcutId: 'reaction',
    handler: async () => setIsVisible((prev) => !prev),
  })

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
      id: instanceIdRef.current++,
      emoji,
      participant: room.localParticipant,
    }
    setReactions((prev) => [...prev, newReaction])

    // Remove this reaction after animation
    setTimeout(() => {
      setReactions((prev) =>
        prev.filter((instance) => instance.id !== newReaction.id)
      )
    }, ANIMATION_DURATION)
  }

  const debouncedSendReaction = useRateLimiter({
    callback: sendReaction,
    maxCalls: 10,
    windowMs: 1000,
  })

  // Custom animation implementation for the emoji toolbar
  // Could not use a menu and its animation, because a menu would make the toolbar inaccessible by keyboard
  // animation isn't perfect
  const [isRendered, setIsRendered] = useState(isVisible)
  const [opacity, setOpacity] = useState(isVisible ? 1 : 0)

  useEffect(() => {
    if (isVisible) {
      // Show: first render, then animate in
      setIsRendered(true)
      // Need to delay setting opacity to ensure CSS transition works
      // (using requestAnimationFrame to ensure DOM has updated)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1)
        })
      })
    } else if (isRendered) {
      // Hide: first animate out, then unrender
      setOpacity(0)

      // Wait for animation to complete before removing from DOM
      const timer = setTimeout(() => {
        setIsRendered(false)
      }, 200) // Match this to your animation duration
      return () => clearTimeout(timer)
    }
  }, [isVisible, isRendered])

  return (
    <>
      <div
        className={css({
          position: 'relative',
        })}
      >
        <ToggleButton
          square
          variant="primaryDark"
          aria-label={t('button')}
          tooltip={t('button')}
          onPress={() => setIsVisible(!isVisible)}
        >
          <RiEmotionLine />
        </ToggleButton>
        {isRendered && (
          <div
            className={css({
              position: 'absolute',
              top: -63,
              left: -162,
              borderRadius: '8px',
              padding: '0.35rem',
              backgroundColor: 'primaryDark.50',
              opacity: opacity,
              transition: 'opacity 0.2s ease',
            })}
            onTransitionEnd={() => {
              if (!isVisible) {
                setIsRendered(false)
              }
            }}
          >
            <RACToolbar
              className={css({
                display: 'flex',
                gap: '0.5rem',
              })}
            >
              {Object.values(Emoji).map((emoji, index) => (
                <Button
                  key={index}
                  onPress={() => debouncedSendReaction(emoji)}
                  aria-label={t('send', { emoji: getEmojiLabel(emoji, t) })}
                  variant="primaryTextDark"
                  size="sm"
                  square
                  data-attr={`send-reaction-${emoji}`}
                >
                  <img
                    src={`/assets/reactions/${emoji}.png`}
                    alt=""
                    className={css({
                      minHeight: '28px',
                      minWidth: '28px',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    })}
                  />
                </Button>
              ))}
            </RACToolbar>
          </div>
        )}
      </div>
      <ReactionPortals reactions={reactions} />
    </>
  )
}
