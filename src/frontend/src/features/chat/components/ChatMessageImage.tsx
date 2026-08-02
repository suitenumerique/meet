import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import type { ChatMediaRow } from '@/stores/chat'

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
 * does not jump when the image lands. The sender measured these; a receiver
 * that was not told falls back to a fixed box.
 */
const aspectRatio = (row: ChatMediaRow) =>
  row.width && row.height ? `${row.width} / ${row.height}` : undefined

type ChatMessageImageProps = {
  item: ChatMediaRow
}

/**
 * Progress lives in its own component so that updating it re-renders nothing
 * else. The row sits inside a virtualized list, and a transfer writes a new
 * percentage twenty times.
 */
const TransferProgress = ({ item }: { item: ChatMediaRow }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })
  const percent =
    item.progress == null ? undefined : Math.round(item.progress * 100)

  return (
    <div
      role="progressbar"
      aria-label={t('receiving')}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={css({
        width: '100%',
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
        style={{ width: percent == null ? '100%' : `${percent}%` }}
      />
    </div>
  )
}

export const ChatMessageImage = ({ item }: ChatMessageImageProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })

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
        <TransferProgress item={item} />
        <Text variant="smNote" margin={false}>
          {t('receiving')}
        </Text>
      </StyledFigure>
    )
  }

  return (
    <StyledFigure>
      <StyledFrame style={{ maxWidth: '16rem' }}>
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
      </StyledFrame>
      {!!item.caption && (
        <Text variant="sm" margin={false} className={css({ whiteSpace: 'pre-wrap' })}>
          {item.caption}
        </Text>
      )}
    </StyledFigure>
  )
}
