import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { useTranslation } from 'react-i18next'
import { Center, VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import { Button } from 'react-aria-components'
import { css } from '@/styled-system/css'

const errorIconStyles = css({
  fontSize: '48px',
  color: '#e74c3c',
  marginBottom: '16px',
})

const retryButtonStyles = css({
  marginTop: '16px',
  padding: '8px 16px',
  backgroundColor: '#3498db',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: '#2980b9',
  },
})

export const ErrorScreen = ({
  title,
  body,
  onRetry,
  showRetry = true,
}: {
  title?: string
  body?: string
  onRetry?: () => void
  showRetry?: boolean
}) => {
  const { t } = useTranslation()
  
  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      window.location.reload()
    }
  }

  return (
    <Screen layout="centered">
      <CenteredContent title={title ?? t('error.heading')} withBackButton>
        <Center>
          <VStack gap="4" alignItems="center">
            <div className={errorIconStyles}>⚠️</div>
            {!!body && (
              <Text as="p" variant="h3" centered>
                {body}
              </Text>
            )}
            {showRetry && (
              <Button className={retryButtonStyles} onPress={handleRetry}>
                {t('error.retry', 'Try Again')}
              </Button>
            )}
          </VStack>
        </Center>
      </CenteredContent>
    </Screen>
  )
}
