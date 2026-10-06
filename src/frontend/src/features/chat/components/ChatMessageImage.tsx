import { useState } from 'react'
import { ProgressBar } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import type { ChatMediaRow } from '@/stores/chat'
import { MAX_ASPECT_RATIO } from '../media/constants'
import { ChatImageLightbox } from './ChatImageLightbox'

const StyledFigure = styled('figure', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    margin: 0,
    maxWidth: '100%',
  },
})

const StyledFrame = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: 'greyscale.50',
    maxWidth: '100%',
  },
})

/**
 * Reserves the final height while the bytes are still arriving, so the list
 * does not jump when the image lands. Until then the dimensions are the
 * sender's word, and once the image decodes they are its own; either way the
 * ratio is clamped, so no row can bury the rest of the chat.
 */
const aspectRatio = (row: ChatMediaRow) => {
  if (!row.width || !row.height) return '4 / 3'
  const ratio = row.width / row.height
  return String(
    Math.min(MAX_ASPECT_RATIO, Math.max(1 / MAX_ASPECT_RATIO, ratio))
  )
}

type ChatMessageImageProps = {
  item: ChatMediaRow
}

export const ChatMessageImage = ({ item }: ChatMessageImageProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })
  const [isOpen, setIsOpen] = useState(false)

  if (item.status === 'failed') {
    return (
      <Text variant="smNote" margin={false}>
        {t(`error.${item.error ?? 'transfer_failed'}`)}
      </Text>
    )
  }

  if (item.status === 'receiving' || !item.objectUrl) {
    return (
      <StyledFigure aria-busy>
        <StyledFrame
          style={{ aspectRatio: aspectRatio(item), width: '12rem' }}
        />
        <ProgressBar
          aria-label={t('receiving')}
          value={(item.progress ?? 0) * 100}
          isIndeterminate={item.progress == null}
          className={css({ width: '100%' })}
        >
          {({ percentage }) => (
            <div
              className={css({
                height: '4px',
                borderRadius: 'full',
                backgroundColor: 'greyscale.200',
                overflow: 'hidden',
              })}
            >
              <div
                className={css({
                  height: '100%',
                  backgroundColor: 'primary.500',
                  transition: 'width 150ms linear',
                })}
                style={{ width: `${percentage ?? 100}%` }}
              />
            </div>
          )}
        </ProgressBar>
        <Text variant="smNote" margin={false}>
          {t('receiving')}
        </Text>
      </StyledFigure>
    )
  }

  return (
    <StyledFigure>
      <StyledFrame style={{ maxWidth: '16rem' }}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={t('enlarge')}
          className={css({
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            '&:focus-visible': {
              outline: '2px solid token(colors.primary.500)',
            },
          })}
          data-attr="chat-open-image"
        >
          <img
            src={item.objectUrl}
            alt={item.caption || t('alt')}
            style={{ aspectRatio: aspectRatio(item) }}
            className={css({
              display: 'block',
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
            })}
          />
        </button>
      </StyledFrame>
      <ChatImageLightbox
        item={item}
        objectUrl={item.objectUrl}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
      {!!item.caption && (
        <Text
          variant="sm"
          margin={false}
          className={css({ whiteSpace: 'pre-wrap' })}
        >
          {item.caption}
        </Text>
      )}
    </StyledFigure>
  )
}
