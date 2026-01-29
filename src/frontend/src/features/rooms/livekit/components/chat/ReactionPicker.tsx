import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { useState, useEffect } from 'react'
import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import { Emoji } from '@/features/rooms/livekit/components/controls/ReactionsToggle'
import { getEmojiLabel } from '@/features/rooms/livekit/utils/reactionUtils'
import { Toolbar as RACToolbar } from 'react-aria-components'

interface ReactionPickerProps {
  onReactionSelect: (emoji: string) => void
}

export const ReactionPicker = ({ onReactionSelect }: ReactionPickerProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.reactions' })
  const [isVisible, setIsVisible] = useState(false)

  // Animation state management
  const [isRendered, setIsRendered] = useState(isVisible)
  const [opacity, setOpacity] = useState(isVisible ? 1 : 0)

  useEffect(() => {
    if (isVisible) {
      setIsRendered(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1)
        })
      })
    } else if (isRendered) {
      setOpacity(0)
      const timer = setTimeout(() => {
        setIsRendered(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isVisible, isRendered])

  const handleReactionSelect = (emoji: string) => {
    onReactionSelect(emoji)
    setIsVisible(false)
  }

  return (
    <div
      className={css({
        position: 'relative',
      })}
    >
      <Button
        size="xs"
        variant="quaternaryText"
        square
        aria-label={t('add')}
        tooltip={t('add')}
        onPress={() => setIsVisible(!isVisible)}
        data-attr="chat-reaction-picker-trigger"
      >
        <RiEmotionLine size={18} />
      </Button>
      {isRendered && (
        <div
          className={css({
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '0.25rem',
            borderRadius: '8px',
            padding: '0.35rem',
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            border: '1px solid',
            borderColor: 'greyscale.200',
            opacity: opacity,
            transition: 'opacity 0.2s ease',
            zIndex: 10,
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
              gap: '0.25rem',
            })}
          >
            {Object.values(Emoji).map((emoji, index) => (
              <Button
                key={index}
                onPress={() => handleReactionSelect(emoji)}
                aria-label={t('sendReaction', {
                  emoji: getEmojiLabel(emoji, t),
                })}
                variant="secondaryText"
                size="xs"
                square
                data-attr={`chat-reaction-${emoji}`}
              >
                <img
                  src={`/assets/reactions/${emoji}.png`}
                  alt=""
                  className={css({
                    minHeight: '24px',
                    minWidth: '24px',
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
  )
}
