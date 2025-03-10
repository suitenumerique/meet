import { Screen } from '@/layout/Screen'
import { Bold, H, P, A } from '@/primitives'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

export const LegalTermsRoute = () => {
  const { t } = useTranslation('legals')

  const indentedStyle = css({
    paddingLeft: '1.5rem',
    marginLeft: '1rem',
    borderLeft: '1px solid black',
    marginTop: '1.5rem',
  })

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        <H lvl={2}>{t('creator.title')}</H>
        <P>{t('creator.body')}</P>
        <H lvl={3} bold>
          {t('creator.contact.title')}
        </H>
        <P>
          {t('creator.contact.address', {
            address: 'DINUM, 20 avenue de Ségur, 75007 Paris',
          })}
          <br />
          {t('creator.contact.phone', {
            phone: '01.71.21.01.70',
          })}
          <br />
          {t('creator.contact.siret', {
            siret: '12000101100010 (secrétariat général du gouvernement)',
          })}
          <br />
          {t('creator.contact.siren', {
            siren: '120 001 011',
          })}
        </P>

        <H lvl={2}>{t('director.title')}</H>
        <P>{t('director.body')}</P>

        <H lvl={2}>{t('hosting.title')}</H>
        <P>{t('hosting.body')}</P>
        <P className={indentedStyle}>
          <Bold>{t('hosting.address.line1')}</Bold>
          <br />
          {t('hosting.address.line2')}
          <br />
          {t('hosting.address.line3')}
          <br />
          {t('hosting.address.line4')}
        </P>

        <H lvl={2}>{t('accessibility.title')}</H>
        <P>{t('accessibility.body')}</P>
        <P>
          <Bold>{t('accessibility.status')}</Bold>
        </P>

        <H lvl={3} bold>
          {t('accessibility.reporting.title')}
        </H>
        <P>
          {t('accessibility.reporting.body1').replace(
            'visio@numerique.gouv.fr.',
            ''
          )}
          <A href="mailto:visio@numerique.gouv.fr" color="primary">
            visio@numerique.gouv.fr
          </A>
          .
        </P>
        <P>
          {t('accessibility.reporting.body2').replace(
            'https://formulaire.defenseurdesdroits.fr',
            ''
          )}{' '}
          <A href="https://formulaire.defenseurdesdroits.fr" color="primary">
            https://formulaire.defenseurdesdroits.fr
          </A>{' '}
          {
            t('accessibility.reporting.body2').split(
              'https://formulaire.defenseurdesdroits.fr'
            )[1]
          }
        </P>
        <P className={indentedStyle}>
          <Bold>{t('accessibility.reporting.address.line1')}</Bold>
          <br />
          {t('accessibility.reporting.address.line2')}
          <br />
          {t('accessibility.reporting.address.line3')}
        </P>

        {/* Content reuse section */}
        <H lvl={2}>{t('reuse.title')}</H>
        <P>{t('reuse.body1')}</P>
        <P>{t('reuse.body2')}</P>

        {/* Media subsection */}
        <H lvl={3} bold>
          {t('reuse.media.title')}
        </H>
        <P>
          {t('reuse.media.body').replace('visio@numerique.gouv.fr.', '')}
          <A href="mailto:visio@numerique.gouv.fr" color="primary">
            visio@numerique.gouv.fr
          </A>
          .
        </P>
        <H lvl={2}>{t('liability.title')}</H>
        <P>{t('liability.body1')}</P>
        <P>{t('liability.body2')}</P>
        <P>{t('liability.body3')}</P>
        <P>{t('liability.body4')}</P>
        <H lvl={2}>{t('dataProtection.title')}</H>
        <P>
          {t('dataProtection.body').replace('dpd@pm.gouv.fr', '')}{' '}
          <A href="mailto:dpd@pm.gouv.fr" color="primary">
            dpd@pm.gouv.fr
          </A>{' '}
          {t('dataProtection.body').split('dpd@pm.gouv.fr')[1]}
        </P>
        <P className={indentedStyle}>
          <Bold>{t('dataProtection.address.line1')}</Bold>
          <br />
          {t('dataProtection.address.line2')}
          <br />
          {t('dataProtection.address.line3')}
          <br />
          {t('dataProtection.address.line4')}
        </P>
      </HStack>
    </Screen>
  )
}
