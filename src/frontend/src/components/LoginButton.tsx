import { LinkButton } from '@/primitives'
import { authUrl } from '@/features/auth'
import { useTranslation } from 'react-i18next'

export const LoginButton = () => {
  const { t } = useTranslation('global', { keyPrefix: 'login' })
  return (
    <LinkButton href={authUrl()} data-attr="login" variant="primary">
      {t('buttonLabel')}
    </LinkButton>
  )
}
