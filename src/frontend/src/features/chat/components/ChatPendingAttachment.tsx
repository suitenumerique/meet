import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { RiCloseLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Button, Text } from '@/primitives'
import { chatStore, clearPendingAttachment } from '@/stores/chat'

const StyledRow = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: 'greyscale.50',
    borderRadius: 4,
    marginTop: '0.75rem',
  },
})

/**
 * The staged image, above the text box, before anything is sent. Its presence
 * is what makes a drop reversible: nothing leaves the browser until send.
 */
export const ChatPendingAttachment = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.media' })
  const { pendingAttachment, isPreparing, isSendingMedia, mediaFailure } =
    useSnapshot(chatStore)

  // Shown beside the staged image, not instead of it: after a failed send the
  // participant still needs the thumbnail and remove button to retry.
  const failure = mediaFailure && (
    <StyledRow role="alert">
      <Text variant="smNote" margin={false}>
        {t(`error.${mediaFailure}`)}
      </Text>
    </StyledRow>
  )

  if (isPreparing) {
    return (
      <StyledRow>
        <Text variant="smNote" margin={false}>
          {t('preparing')}
        </Text>
      </StyledRow>
    )
  }

  if (!pendingAttachment) return failure || null

  return (
    <>
      {failure}
      <StyledRow>
        <img
          src={pendingAttachment.previewUrl}
          alt={t('stagedAlt')}
          className={css({
            width: '2.5rem',
            height: '2.5rem',
            objectFit: 'cover',
            borderRadius: 4,
          })}
        />
        <Text variant="smNote" margin={false} className={css({ flexGrow: 1 })}>
          {t('staged')}
        </Text>
        <Button
          square
          invisible
          variant="tertiaryText"
          size="sm"
          aria-label={t('remove')}
          isDisabled={isSendingMedia}
          onPress={clearPendingAttachment}
          data-attr="chat-remove-image"
        >
          <RiCloseLine size={18} />
        </Button>
      </StyledRow>
    </>
  )
}
