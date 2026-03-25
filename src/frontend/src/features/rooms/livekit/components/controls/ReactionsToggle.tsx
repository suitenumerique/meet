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
import {
  Popover as RACPopover,
  Dialog,
  DialogTrigger,
} from 'react-aria-components'
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

  const [isOpen, setIsOpen] = useState(false)

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: () => setIsOpen((prev) => !prev),
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

  return (
    <>
      <div className={css({ position: 'relative' })}>
        <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
          <ToggleButton
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
            <Dialog className={css({ outline: 'none' })}>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- FocusScope autoFocus is programmatic focus for overlays, not the HTML autofocus attribute */}
              <FocusScope contain autoFocus restoreFocus>
                <div
                  role="toolbar"
                  aria-orientation="horizontal"
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
                  ))}
                </div>
              </FocusScope>
            </Dialog>
          </RACPopover>
        </DialogTrigger>
      </div>
      <ReactionPortals reactions={reactions} />
    </>
  )
}
