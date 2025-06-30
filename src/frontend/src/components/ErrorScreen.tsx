import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { useTranslation } from 'react-i18next'
import { Center } from '@/styled-system/jsx'
import { Text } from '@/primitives'

export const ErrorScreen = ({
  title,
  body,
}: {
  title?: string
  body?: string
}) => {
  const { t } = useTranslation()
  return (
    <Screen layout="centered">
      <CenteredContent title={title ?? t('error.heading')} withBackButton>
        {!!body && (
          <Center>
            <Text as="p" variant="h3" centered>
              {body}
            </Text>
          </Center>
        )}
      </CenteredContent>
    </Screen>
  )
}
