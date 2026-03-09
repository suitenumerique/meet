import { A, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'

const appTitle = import.meta.env.VITE_APP_TITLE ?? 'LaSuite Meet'

export const MoreLink = () => {
  const { t } = useTranslation('home')
  const { data } = useConfig()

  if (!data?.manifest_link) return null

  return (
    <Text as="p" variant="sm" style={{ padding: '1rem 0' }}>
      <A
        href={data?.manifest_link}
        target="_blank"
        rel="noopener noreferrer"
        externalIcon
        aria-label={t('moreLinkLabel', { appTitle })}
      >
        {t('moreLink')} {t('moreAbout', { appTitle })}
      </A>
    </Text>
  )
}
