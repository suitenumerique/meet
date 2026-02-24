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
import { Popover as RACPopover, Toolbar } from 'react-aria-components'
import { FocusScope } from '@react-aria/focus'
import { Participant } from 'livekit-client'
import useRateLimiter from '@/hooks/useRateLimiter'

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
  const triggerRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: () => {
      if (isOpen) {
        document
          .querySelector<HTMLElement>('[role="toolbar"] button')
          ?.focus()
      } else {
        setIsOpen(true)
      }
    },
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

  const handleToolbarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      document.getElementById('reaction-toggle')?.focus()
      return
    }

    const buttons = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
        '[role="toolbar"] button'
      )
    )
    if (buttons.length === 0) return

    if (
      e.key === 'ArrowRight' &&
      document.activeElement === buttons[buttons.length - 1]
    ) {
      e.preventDefault()
      e.stopPropagation()
      buttons[0].focus()
    } else if (
      e.key === 'ArrowLeft' &&
      document.activeElement === buttons[0]
    ) {
      e.preventDefault()
      e.stopPropagation()
      buttons[buttons.length - 1].focus()
    }
  }

  const debouncedSendReaction = useRateLimiter({
    callback: sendReaction,
    maxCalls: 10,
    windowMs: 1000,
  })

  return (
    <>
      <div className={css({ position: 'relative' })}>
        <ToggleButton
          ref={triggerRef}
          id="reaction-toggle"
          square
          variant="primaryDark"
          aria-label={t('button')}
          tooltip={t('button')}
          isSelected={isOpen}
          onChange={setIsOpen}
        >
          <RiEmotionLine />
        </ToggleButton>
        <RACPopover
          triggerRef={triggerRef}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          placement="top"
          offset={8}
          isNonModal
          shouldCloseOnInteractOutside={() => false}
          className={css({
            borderRadius: '8px',
            padding: '0.35rem',
            backgroundColor: 'primaryDark.50',
            '&[data-entering]': {
              animation: 'fade 200ms ease',
            },
            '&[data-exiting]': {
              animation: 'fade 200ms ease-in reverse',
            },
          })}
        >
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- FocusScope autoFocus is programmatic focus for overlays, not the HTML autofocus attribute */}
          <FocusScope autoFocus restoreFocus>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- handles Tab exit and arrow wrapping for the portal-rendered toolbar */}
            <div onKeyDownCapture={handleToolbarKeyDown}>
              <Toolbar
                orientation="horizontal"
                aria-label={t('button')}
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
                      src={`/assets/reactions/${emoji}.pPng`}
                      alt=""
                      className={css({
                        width: '28px',
                        height: '28px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      })}
                    />
                  </Button>
                ))}
              </Toolbar>
            </div>
          </FocusScope>
        </RACPopover>
      </div>
      <ReactionPortals reactions={reactions} />
    </>
  )
}
