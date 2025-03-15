import { Screen } from '@/layout/Screen'
import { H, P, A, Italic, Ul } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

export const AccessibilityRoute = () => {
  const { t } = useTranslation('accessibility', { keyPrefix: 'accessibility' })

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        <P dangerouslySetInnerHTML={{ __html: t('introduction') }}></P>
        <H lvl={2} bold>
          {t('declaration.title')}
        </H>
        <Italic>{t('declaration.date')}</Italic>
        <P>
          {t('scope').replace('visio.numerique.gouv.fr', '')}{' '}
          <A href="https://visio.numerique.gouv.fr" color="primary">
            visio.numerique.gouv.fr
          </A>
          .
        </P>

        <H lvl={2} bold>
          {t('complianceStatus.title')}
        </H>
        <P>
          <A href="https://visio.numerique.gouv.fr" color="primary">
            visio.numerique.gouv.fr
          </A>
          {t('complianceStatus.body').replace('visio.numerique.gouv.fr', '')}
        </P>

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
            <A href="mailto:lasuite@modernisation.gouv.fr" color="primary">
              lasuite@modernisation.gouv.fr
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
            <P
              dangerouslySetInnerHTML={{
                __html: t('recourse.options.option3'),
              }}
            ></P>
          </li>
        </Ul>
      </HStack>
    </Screen>
  )
}
