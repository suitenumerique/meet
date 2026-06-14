import { Link as RALink } from 'react-aria-components'
import { authUrl } from '@/features/auth/utils/authUrl'
import { cva } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { VStack } from '@/styled-system/jsx'
import { Link } from '@/primitives'

// Styles per their documentation https://github.com/numerique-gouv/agentconnect-documentation/blob/main/doc_fs/bouton_proconnect.md
const proConnectButtonRecipe = cva({
  base: {
    backgroundColor: 'transparent !important',
    backgroundImage: `url('/assets/proconnect-button.svg'), url('/assets/proconnect-button-hovered.svg')`,
    backgroundPosition: '50% 50%',
    backgroundRepeat: 'no-repeat',
    width: '214px',
    height: '56px',
    border: 'none',
    '&[data-hovered]': {
      cursor: 'pointer',
      backgroundImage: `url('/assets/proconnect-button-hovered.svg'), url('/assets/proconnect-button.svg')`,
    },
  },
})

export type ProConnectButtonProps = {
  hint?: boolean // Hide hint in layouts where space doesn't allow it.
}

export const ProConnectButton = ({ hint = true }: ProConnectButtonProps) => {
  const { t } = useTranslation('global', { keyPrefix: 'login' })
  return (
    <VStack alignItems="start">
      <RALink
        className={proConnectButtonRecipe()}
        aria-label={t('proconnectButtonLabel')}
        href={authUrl()}
        data-attr="login"
      />
      {hint && (
        <Link
          to="https://agentconnect.gouv.fr/"
          target="_blank"
          rel="noopener noreferrer"
          color="note"
          aria-label={t('proconnectLinkLabel')}
        >
          {t('proconnectLink')}
        </Link>
      )}
    </VStack>
  )
}
