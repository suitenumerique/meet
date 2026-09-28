import { useTranslation } from 'react-i18next'
import { RiDownloadLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Dialog, Text } from '@/primitives'
import type { ChatMediaRow } from '@/stores/chat'
import { imageExtension } from '../media/probeImage'

type ChatImageLightboxProps = {
  item: ChatMediaRow
  objectUrl: string
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

/**
 * The enlarged view, and the only place an image can be saved from.
 *
 * The blob URL is never navigated to, only used as an `img` source or an
 * anchor's download target. A `blob:` URL is same-origin, so opening one in a
 * tab would run whatever the bytes turn out to be under this application's
 * origin.
 */
export const ChatImageLightbox = ({
  item,
  objectUrl,
  isOpen,
  onOpenChange,
}: ChatImageLightboxProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })

  return (
    <Dialog
      size="large"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      // Named rather than titled: a `title` renders a heading above the image,
      // which would repeat the caption shown beneath it.
      aria-label={item.caption || t('alt')}
    >
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          alignItems: 'flex-start',
        })}
      >
        <img
          src={objectUrl}
          alt={item.caption || t('alt')}
          className={css({
            maxWidth: '100%',
            maxHeight: '70vh',
            objectFit: 'contain',
            borderRadius: 4,
          })}
        />
        {!!item.caption && (
          <Text
            variant="body"
            margin={false}
            className={css({ whiteSpace: 'pre-wrap' })}
          >
            {item.caption}
          </Text>
        )}
        <a
          href={objectUrl}
          download={`image-${item.id.slice(0, 8)}.${imageExtension(item.mimeType)}`}
          className={css({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            textDecoration: 'underline',
          })}
          data-attr="chat-download-image"
        >
          <RiDownloadLine size={16} />
          {t('download')}
        </a>
      </div>
    </Dialog>
  )
}
