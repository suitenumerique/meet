import { Screen } from '@/layout/Screen'
import { Bold, H, P, A, Link } from '@/primitives'
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
        {/* Éditeur section */}
        <H lvl={2}>{t('creator.title')}</H>
        <P>{t('creator.body')}</P>
        <P className={indentedStyle}>
          {t('creator.contact.address')}
          <br />
          {t('creator.contact.city')}
          <br />
          {t('creator.contact.phone')}
          <br />
          {t('creator.contact.siret')}
          <br />
          {t('creator.contact.siren')}
        </P>

        {/* Directeur de la publication section */}
        <H lvl={2}>{t('director.title')}</H>
        <P>{t('director.body')}</P>

        {/* Hébergement section */}
        <H lvl={2}>{t('hosting.title')}</H>
        <P>{t('hosting.body')}</P>

        {/* Accessibilité section */}
        <H lvl={2}>{t('accessibility.title')}</H>
        <P>{t('accessibility.body')}</P>
        <P>
          {t('accessibility.more')}
          <Link to="/accessibilite" color="primary">
            {t('accessibility.link')}
          </Link>
        </P>

        <P>
          <Bold>{t('accessibility.status')}</Bold>
        </P>

        {/* Réutilisation des contenus et liens section */}
        <H lvl={2}>{t('reuse.title')}</H>
        <P>
          {t('reuse.body1')}{' '}
          <A
            href="https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf"
            color="primary"
          >
            {t('reuse.license')}
          </A>
          .
        </P>
        <P>{t('reuse.body2')}</P>
        <P>{t('reuse.body3')}</P>
      </HStack>
    </Screen>
  )
}
