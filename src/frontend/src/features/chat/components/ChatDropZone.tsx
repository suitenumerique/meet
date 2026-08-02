import { ReactNode } from 'react'
import { DropZone } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'

type ChatDropZoneProps = {
  onDrop: (file: File) => void
  isDisabled?: boolean
  acceptedMimetypes: string[]
  children: ReactNode
}

/**
 * Wraps the whole chat panel so a file can be dropped anywhere in it rather
 * than onto a small target. Convenience only: the picker button and pasting
 * both do the same thing without a pointer.
 */
export const ChatDropZone = ({
  onDrop,
  isDisabled,
  acceptedMimetypes,
  children,
}: ChatDropZoneProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })

  return (
    <DropZone
      isDisabled={isDisabled}
      aria-label={t('dropZone')}
      getDropOperation={(types) =>
        acceptedMimetypes.some((type) => types.has(type)) ? 'copy' : 'cancel'
      }
      onDrop={async (event) => {
        const item = event.items.find(
          (candidate) =>
            candidate.kind === 'file' &&
            acceptedMimetypes.includes(candidate.type)
        )
        if (item?.kind === 'file') onDrop(await item.getFile())
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
