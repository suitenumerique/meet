import { useTranslation } from 'react-i18next'
import { Text } from '@/primitives'

// Shown when a breakout action failed, so the host can try again.
export const ErrorNote = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  return (
    <Text variant="warning" role="alert">
      {t('error')}
    </Text>
  )
}
