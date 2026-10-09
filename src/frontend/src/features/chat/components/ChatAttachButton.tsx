import { FileTrigger } from 'react-aria-components'
import { RiImageAddLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'

type ChatAttachButtonProps = {
  onSelect: (file: File) => void
  isDisabled?: boolean
  acceptedMimetypes: string[]
}

/**
 * The keyboard route in, and the only practical one on a touch screen where
 * there is nothing to drag from. Dragging is never the sole entry point.
 */
export const ChatAttachButton = ({
  onSelect,
  isDisabled,
  acceptedMimetypes,
}: ChatAttachButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })

  return (
    <FileTrigger
      acceptedFileTypes={acceptedMimetypes}
      onSelect={(files) => {
        const file = files?.[0]
        if (file) onSelect(file)
      }}
    >
      <Button
        square
        invisible
        variant="tertiaryText"
        size="sm"
        isDisabled={isDisabled}
        aria-label={t('attach')}
        data-attr="chat-attach-image"
      >
        <RiImageAddLine size={20} />
      </Button>
    </FileTrigger>
  )
}
