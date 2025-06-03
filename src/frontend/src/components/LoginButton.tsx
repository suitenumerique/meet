import { LinkButton } from '@/primitives'
import { authUrl } from '@/features/auth'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'
import { ProConnectButton } from './ProConnectButton'

type LoginButtonProps = {
  proConnectHint?: boolean // Hide hint in layouts where space doesn't allow it.
}

export const LoginButton = ({ proConnectHint = true }: LoginButtonProps) => {
  const { t } = useTranslation('global', { keyPrefix: 'login' })
  const { data } = useConfig()

  if (data?.use_proconnect_button) {
    return <ProConnectButton hint={proConnectHint} />
  }

  return (
    <LinkButton href={authUrl()} data-attr="login" variant="primary">
      {t('buttonLabel')}
    </LinkButton>
  )
}
