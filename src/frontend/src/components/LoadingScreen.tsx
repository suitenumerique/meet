import { Screen, type ScreenProps } from '@/layout/Screen'
import { DelayedRender } from './DelayedRender'
import { CenteredContent } from '@/layout/CenteredContent'
import { useTranslation } from 'react-i18next'
import { Center, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'

const spinnerStyles = css({
  width: '40px',
  height: '40px',
  border: '4px solid #f3f3f3',
  borderTop: '4px solid #3498db',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
  marginBottom: '16px',
})

const loadingContainerStyles = css({
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
})

export const LoadingScreen = ({
  delay = 500,
  header = undefined,
  footer = undefined,
  layout = 'centered',
  message,
}: {
  delay?: number
  message?: string
} & Omit<ScreenProps, 'children'>) => {
  const { t } = useTranslation()

  return (
    <DelayedRender delay={delay}>
      <Screen layout={layout} header={header} footer={footer}>
        <CenteredContent>
          <Center>
            <VStack gap="4" className={loadingContainerStyles}>
              <div className={spinnerStyles} />
              <p>{message || t('loading')}</p>
            </VStack>
          </Center>
        </CenteredContent>
      </Screen>
    </DelayedRender>
  )
}
