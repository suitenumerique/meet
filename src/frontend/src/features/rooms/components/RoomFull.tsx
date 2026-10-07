import { useTranslation } from 'react-i18next'
import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { Center, VStack } from '@/styled-system/jsx'
import { Button, Text } from '@/primitives'

/**
 * Shown when the meeting is full. onRetry tries the join again, and a join
 * that is still refused comes back here.
 */
export const RoomFull = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.roomFull' })

  return (
    <Screen layout="centered">
      <CenteredContent title={t('heading')} withBackButton>
        <VStack gap="1rem">
          <Center>
            <Text as="p" variant="h3" centered>
              {t('body')}
            </Text>
          </Center>
          <Button variant="primary" onPress={onRetry}>
            {t('retry')}
          </Button>
        </VStack>
      </CenteredContent>
    </Screen>
  )
}
