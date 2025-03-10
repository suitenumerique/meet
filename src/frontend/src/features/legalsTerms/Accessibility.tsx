import { Screen } from '@/layout/Screen'
import { Bold, H, P, A, Italic, Ul } from '@/primitives'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

export const AccessibilityRoute = () => {
  const { t } = useTranslation('accessibility', { keyPrefix: 'accessibility' })

  const indentedStyle = css({
    paddingLeft: '1.5rem',
    marginLeft: '1rem',
    borderLeft: '1px solid black',
    marginTop: '1.5rem',
  })

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        <P dangerouslySetInnerHTML={{ __html: t('introduction') }}></P>

        <H lvl={2} bold>
          {t('declaration.title')}
        </H>
        <Italic>{t('declaration.date')}</Italic>
        <P>{t('scope')}</P>

        <H lvl={2} bold>
          {t('complianceStatus.title')}
        </H>
        <P>{t('complianceStatus.body')}</P>
        <H lvl={2} bold>
          {t('improvement.title')}
        </H>
        <P>{t('improvement.body')}</P>
        <Ul
          style={{
            marginBottom: '1rem',
          }}
        >
          <li>
            {t('improvement.contact.email').replace(
              'visio@numerique.gouv.fr',
              ''
            )}
            <A href="mailto:visio@numerique.gouv.fr" color="primary">
              visio@numerique.gouv.fr
            </A>
          </li>
          <li>{t('improvement.contact.address')}</li>
        </Ul>
        <P>{t('improvement.response')}</P>

        <H lvl={2} bold>
          {t('recourse.title')}
        </H>
        <P>{t('recourse.introduction')}</P>

        <P>{t('recourse.options.intro')}</P>

        <Ul>
          <li>{t('recourse.options.option1')}</li>
          <li>{t('recourse.options.option2')}</li>
          <li>
            {t('recourse.options.option3')}
            <P className={indentedStyle}>
              <Bold>{t('dataProtection.line1')}</Bold>
              <br />
              {t('dataProtection.line2')}
              <br />
              {t('dataProtection.line3')}
              <br />
              {t('dataProtection.line4')}
            </P>
          </li>
        </Ul>
      </HStack>
    </Screen>
  )
}
