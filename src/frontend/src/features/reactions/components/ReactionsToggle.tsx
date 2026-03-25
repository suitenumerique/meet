import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { useState } from 'react'
import { css } from '@/styled-system/css'
import { ToggleButton, Button } from '@/primitives'

import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import {
  Popover as RACPopover,
  Dialog,
  DialogTrigger,
} from 'react-aria-components'
import { FocusScope } from '@react-aria/focus'
import { useReactions } from '../hooks/useReactions'
import { Emoji } from '../types'
import { getEmojiLabel } from '../utils'

export const ReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const [isOpen, setIsOpen] = useState(false)

  const { sendReaction } = useReactions()

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: () => setIsOpen((prev) => !prev),
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
                      onPress={() => sendReaction(emoji)}
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
    </>
  )
}
