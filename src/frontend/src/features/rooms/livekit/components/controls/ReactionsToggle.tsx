import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { useState, useRef } from 'react'
import { css } from '@/styled-system/css'
import { useRoomContext } from '@livekit/components-react'
import { Menu, ToggleButton, Button } from '@/primitives'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationPayload } from '@/features/notifications/NotificationPayload'
import {
  ANIMATION_DURATION,
  ReactionPortals,
} from '@/features/rooms/livekit/components/ReactionPortal'
import { Toolbar as RACToolbar } from 'react-aria-components'
import { Participant } from 'livekit-client'

const EMOJIS = ['👍', '👎', '👏', '❤️', '😂', '😮', '🎉']

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

  return (
    <>
      <Menu variant="dark" placement="top">
        <ToggleButton
          square
          variant="primaryDark"
          aria-label={t('button')}
          tooltip={t('button')}
        >
          <RiEmotionLine />
        </ToggleButton>
        <RACToolbar
          className={css({
            display: 'flex',
          })}
        >
          {EMOJIS.map((emoji) => (
            <Button
              onPress={() => sendReaction(emoji)}
              aria-label={t('send', { emoji })}
              variant="quaternaryText"
              size="sm"
            >
              <span
                className={css({
                  fontSize: '20px',
                })}
              >
                {emoji}
              </span>
            </Button>
          ))}
        </RACToolbar>
      </Menu>
      <ReactionPortals reactions={reactions} />
    </>
  )
}
