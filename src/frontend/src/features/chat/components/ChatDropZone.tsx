import { ReactNode } from 'react'
import { DropZone, isFileDropItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { useSendChatMedia } from '../media/useSendChatMedia'

/**
 * Wraps the whole chat panel so a file can be dropped anywhere in it rather
 * than onto a small target. Convenience only: the picker button and pasting
 * both do the same thing without a pointer.
 */
export const ChatDropZone = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })
  const { stage, limits } = useSendChatMedia()

  // Any file is taken, whatever type the system declares: `stage` reads the
  // bytes and says why one cannot be sent, where a refused drop says nothing.
  return (
    <DropZone
      isDisabled={!limits.enabled}
      aria-label={t('dropZone')}
      onDrop={async (event) => {
        const item = event.items.find(isFileDropItem)
        if (item) stage(await item.getFile())
      }}
      className={css({
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        minHeight: 0,
        position: 'relative',
        '&[data-drop-target]': {
          outline: '2px dashed token(colors.primary.500)',
          outlineOffset: '-4px',
          borderRadius: 4,
        },
      })}
    >
      {children}
      <Text
        variant="sm"
        margin={false}
        className={css({
          display: 'none',
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          backgroundColor: 'greyscale.50',
          borderRadius: 4,
          '[data-drop-target] > &': { display: 'flex' },
        })}
      >
        {t('dropHint')}
      </Text>
    </DropZone>
  )
}
