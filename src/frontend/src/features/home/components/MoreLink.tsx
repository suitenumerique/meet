import { A, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'

export const MoreLink = () => {
  const { t } = useTranslation('home')
  const { data } = useConfig()

  if (!data?.manifest_link) return

  return (
    <Text as={'p'} variant={'sm'} style={{ padding: '1rem 0' }}>
      <A
        href={data?.manifest_link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('moreLinkLabel')}
      >
        {t('moreLink')}
      </A>{' '}
      {t('moreAbout', { appTitle: `${import.meta.env.VITE_APP_TITLE}` })}
    </Text>
  )
}
