import { css } from '@/styled-system/css'
import { RiErrorWarningLine, RiExternalLinkLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Text, A } from '@/primitives'
import { GRIST_FORM } from '@/utils/constants'

export const FeedbackBanner = () => {
  const { t } = useTranslation()
  return (
    <div
      className={css({
        width: '100%',
        backgroundColor: '#E8EDFF',
        color: '#0063CB',
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
        <RiErrorWarningLine size={20} aria-hidden="true" />
        <Text as="p">{t('feedback.context')}</Text>
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
          })}
        >
          <A href={GRIST_FORM} target="_blank">
            {t('feedback.cta')}
          </A>
          <RiExternalLinkLine size={16} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
