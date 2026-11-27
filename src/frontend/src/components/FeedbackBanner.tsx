import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { Text, A, Icon } from '@/primitives'
import { useConfig } from '@/api/useConfig'

export const FeedbackBanner = () => {
  const { t } = useTranslation()
  const { data } = useConfig()

  if (!data?.feedback?.url) return

  return (
    <div
      className={css({
        width: '100%',
        backgroundColor: 'brand.050',
        color: 'brand.700',
        display: { base: 'none', sm: 'flex' },
        justifyContent: 'center',
        padding: '0.5rem 0',
      })}
    >
      <div
        className={css({
          display: 'inline-flex',
          gap: '0.5rem',
          alignItems: 'center',
        })}
      >
        <Icon name="error" size={20} />
        <Text as="p" variant="sm">
          {t('feedback.context')}
        </Text>
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '3xs',
          })}
        >
          <A href={data?.feedback?.url} target="_blank" size="sm">
            {t('feedback.cta')}
          </A>
          <Icon name="external-link" size={16} />
        </div>
      </div>
    </div>
  )
}
