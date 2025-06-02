import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Bold } from '@/primitives'

export const NotFoundScreen = () => {
  const { t } = useTranslation()
  return (
    <Screen layout="centered">
      <CenteredContent title={t('notFound.heading')} withBackButton>
        <Text centered>
          {t('notFound.body')} <Bold>{window.origin}/xxx-yyyy-zzz.</Bold>
        </Text>
      </CenteredContent>
    </Screen>
  )
}
