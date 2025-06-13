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
      {data?.app_title && t('moreAbout', { appTitle: data.app_title })}
    </Text>
  )
}
