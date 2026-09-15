import { useId } from 'react'
import { css } from '@/styled-system/css'
import { Button, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'

// Fills the tile while the video is in the other window. Bring-back
// does not stop the share.
export const ScreenSharePopoutPlaceholder = ({
  onReturn,
}: {
  onReturn: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const titleId = useId()

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        gap: '0.5rem',
        padding: '1.5rem',
        textAlign: 'center',
        color: 'white',
        backgroundColor: 'primaryDark.50',
      })}
    >
      <Text as="h2" id={titleId} variant="body">
        {t('placeholderTitle')}
      </Text>
      <Text variant="sm" style={{ maxWidth: '20rem' }}>
        {t('placeholderDescription')}
      </Text>
      <Button variant="primaryTextDark" onPress={onReturn}>
        {t('placeholderBringBack')}
      </Button>
    </div>
  )
}
