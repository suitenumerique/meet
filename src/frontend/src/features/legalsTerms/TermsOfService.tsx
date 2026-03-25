import { Screen } from '@/layout/Screen'
import { H, P, A, Ul } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ensureArray = (value: any) => {
  if (Array.isArray(value)) {
    return value
  }
  return []
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const TermsOfServiceRoute = () => {
  const { t } = useTranslation('termsOfService')

  return (
    <Screen layout="centered" headerTitle={t('title')}>
      <HStack display={'block'} padding={'2rem'}>
        {/* Article 1 */}
        <H lvl={2}>{t('articles.article1.title')}</H>
        <P>{t('articles.article1.content')}</P>

        {/* Article 2 */}
        <H lvl={2}>{t('articles.article2.title')}</H>
        <P>{t('articles.article2.content')}</P>
        {ensureArray(
          t('articles.article2.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 3 */}
        <H lvl={2}>{t('articles.article3.title')}</H>
        {ensureArray(
          t('articles.article3.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 4 */}
        <H lvl={2}>{t('articles.article4.title')}</H>
        <P>{t('articles.article4.definition')}</P>

        {/* Article 5 */}
        <H lvl={2} margin={false}>
          {t('articles.article5.title')}
        </H>

        {/* Section 5.1 */}
        <H lvl={3} bold>
          {t('articles.article5.sections.section1.title')}
        </H>
        <P>{t('articles.article5.sections.section1.content')}</P>
        <P>{t('articles.article5.sections.section1.paragraph1')}</P>
        <P>{t('articles.article5.sections.section1.paragraph2')}</P>
        <Ul>
          {ensureArray(
            t('articles.article5.sections.section1.capabilities', {
              returnObjects: true,
            })
          ).map((capability, index) => (
            <li key={index}>{capability}</li>
          ))}
        </Ul>
        <P
          style={{ marginTop: '0.75rem' }}
          dangerouslySetInnerHTML={{
            __html: t('articles.article5.sections.section1.paragraph3'),
          }}
        ></P>
        <P>{t('articles.article5.sections.section1.paragraph4')}</P>

        {/* Section 5.2 */}
        <H lvl={3} bold>
          {t('articles.article5.sections.section2.title')}
        </H>
        <P>{t('articles.article5.sections.section2.content')}</P>
        <P style={{ marginTop: '0.75rem' }}>
          {t('articles.article5.sections.section2.paragraph')}
        </P>
        <Ul>
          {ensureArray(
            t('articles.article5.sections.section2.capabilities', {
              returnObjects: true,
            })
          ).map((capability, index) => (
            <li key={index}>{capability}</li>
          ))}
        </Ul>

        {/* Article 6 */}
        <H lvl={2} margin={false}>
          {t('articles.article6.title')}
        </H>

        {/* Section 6.1 */}
        <H lvl={3} bold>
          {t('articles.article6.sections.section1.title')}
        </H>
        {ensureArray(
          t('articles.article6.sections.section1.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 6.2 */}
        <H lvl={3} bold>
          {t('articles.article6.sections.section2.title')}
        </H>
        {ensureArray(
          t('articles.article6.sections.section2.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 7 */}
        <H lvl={2}>{t('articles.article7.title')}</H>

        {/* Section 7.1 */}
        <H lvl={3} bold>
          {t('articles.article7.sections.section1.title')}
        </H>
        {ensureArray(
          t('articles.article7.sections.section1.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 7.2 */}
        <H lvl={3} bold>
          {t('articles.article7.sections.section2.title')}
        </H>
        {ensureArray(
          t('articles.article7.sections.section2.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 7.3 */}
        <H lvl={3} bold>
          {t('articles.article7.sections.section3.title')}
        </H>
        {ensureArray(
          t('articles.article7.sections.section3.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 7.4 */}
        <H lvl={3} bold>
          {t('articles.article7.sections.section4.title')}
        </H>
        {ensureArray(
          t('articles.article7.sections.section4.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 7.5 */}
        <H lvl={3} bold>
          {t('articles.article7.sections.section5.title')}
        </H>
        <P>
          {t('articles.article7.sections.section5.content')
            .split('https://github.com/suitenumerique/meet')[0]
            .replace('https://github.com/suitenumerique/meet', '')}{' '}
          <A href="https://github.com/suitenumerique/meet" color="primary">
            https://github.com/suitenumerique/meet
          </A>
          {
            t('articles.article7.sections.section5.content').split(
              'https://github.com/suitenumerique/meet'
            )[1]
          }
        </P>

        {/* Article 8 */}
        <H lvl={2}>{t('articles.article8.title')}</H>
        <P>{t('articles.article8.content')}</P>
      </HStack>
    </Screen>
  )
}
