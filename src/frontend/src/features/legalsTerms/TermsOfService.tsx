import { Screen } from '@/layout/Screen'
import { Bold, H, P, A, Ul } from '@/primitives'
import { css } from '@/styled-system/css'
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
    <Screen layout="centered" headerTitle={t('terms.title')}>
      <HStack display={'block'} padding={'2rem'}>
        <P>{t('terms.introduction')}</P>

        {/* Article 1 */}
        <H lvl={2}>{t('terms.articles.article1.title')}</H>
        <P>{t('terms.articles.article1.content')}</P>

        {/* Article 2 */}
        <H lvl={2}>{t('terms.articles.article2.title')}</H>
        <P>{t('terms.articles.article2.content')}</P>
        <Ul>
          {ensureArray(
            t('terms.articles.article2.purposes', { returnObjects: true })
          ).map((purpose, index) => (
            <li key={index}>{purpose}</li>
          ))}
        </Ul>

        {/* Article 3 */}
        <H lvl={2}>{t('terms.articles.article3.title')}</H>
        {ensureArray(
          t('terms.articles.article3.definitions', { returnObjects: true })
        ).map((def, index) => (
          <P key={index}>
            <Bold>{`"${def.term}"`}</Bold> {def.definition}
          </P>
        ))}

        {/* Article 4 */}
        <H lvl={2}>{t('terms.articles.article4.title')}</H>
        <P>{t('terms.articles.article4.content')}</P>

        {/* Article 5 */}
        <H lvl={2}>{t('terms.articles.article5.title')}</H>

        {/* Section 5.1 */}
        <H lvl={3} bold>
          {t('terms.articles.article5.sections.section1.title')}
        </H>
        <P>{t('terms.articles.article5.sections.section1.content')}</P>
        <P>{t('terms.articles.article5.sections.section1.paragraph1')}</P>
        <P>{t('terms.articles.article5.sections.section1.paragraph2')}</P>
        <Ul>
          {ensureArray(
            t('terms.articles.article5.sections.section1.capabilities', {
              returnObjects: true,
            })
          ).map((capability, index) => (
            <li key={index}>{capability}</li>
          ))}
        </Ul>
        <P
          style={{
            marginTop: '1.5rem',
          }}
        >
          {t('terms.articles.article5.sections.section1.paragraph3')}
        </P>

        {/* Section 5.2 */}
        <H lvl={3} bold>
          {t('terms.articles.article5.sections.section2.title')}
        </H>
        <P>{t('terms.articles.article5.sections.section2.content')}</P>
        <P>{t('terms.articles.article5.sections.section2.paragraph')}</P>
        <Ul>
          {ensureArray(
            t('terms.articles.article5.sections.section2.capabilities', {
              returnObjects: true,
            })
          ).map((capability, index) => (
            <li key={index}>{capability}</li>
          ))}
        </Ul>

        {/* Article 6 */}
        <H lvl={2}>{t('terms.articles.article6.title')}</H>

        {/* Section 6.1 */}
        <H lvl={3} bold>
          {t('terms.articles.article6.sections.section1.title')}
        </H>
        {ensureArray(
          t('terms.articles.article6.sections.section1.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Section 6.2 */}
        <H lvl={3} bold>
          {t('terms.articles.article6.sections.section2.title')}
        </H>
        {ensureArray(
          t('terms.articles.article6.sections.section2.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}

        {/* Article 7 */}
        <H lvl={2}>{t('terms.articles.article7.title')}</H>

        {/* Section 7.1 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section1.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section1.content')}</P>

        {/* Section 7.2 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section2.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section2.content')}</P>

        {ensureArray(
          t('terms.articles.article7.sections.section2.dataCategories', {
            returnObjects: true,
          })
        ).map((category, catIndex) => (
          <div key={catIndex}>
            <P>
              <Bold>{category.category}</Bold>
            </P>
            {category.items && (
              <Ul>
                {ensureArray(category.items).map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </Ul>
            )}
          </div>
        ))}

        {/* Section 7.3 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section3.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section3.content')}</P>
        <Ul>
          {ensureArray(
            t('terms.articles.article7.sections.section3.purposes', {
              returnObjects: true,
            })
          ).map((purpose, index) => (
            <li key={index}>{purpose}</li>
          ))}
        </Ul>

        {/* Section 7.4 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section4.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section4.content')}</P>
        <Ul>
          {ensureArray(
            t('terms.articles.article7.sections.section4.bases', {
              returnObjects: true,
            })
          ).map((basis, index) => (
            <li key={index}>{basis}</li>
          ))}
        </Ul>

        {ensureArray(
          t('terms.articles.article7.sections.section4.details', {
            returnObjects: true,
          })
        ).map((detail, detailIndex) => (
          <div key={detailIndex}>
            <P>
              <Bold>{detail.title}</Bold>
            </P>
            <P>{detail.content}</P>
            <P>{detail.legalReference}</P>
            {detail.legalReferences && (
              <Ul>
                {ensureArray(detail.legalReferences).map((ref, refIndex) => (
                  <li key={refIndex}>{ref}</li>
                ))}
              </Ul>
            )}
          </div>
        ))}

        {/* Section 7.5 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section5.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section5.content')}</P>

        <table
          className={css({
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #ddd',
            marginBottom: '1rem',
          })}
        >
          <thead>
            <tr>
              <th
                className={css({
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  textAlign: 'left',
                })}
              >
                {t('terms.articles.article7.sections.section5.dataType')}
              </th>
              <th
                className={css({
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  textAlign: 'left',
                })}
              >
                {t('terms.articles.article7.sections.section5.retentionPeriod')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ensureArray(
              t('terms.articles.article7.sections.section5.retentionTable', {
                returnObjects: true,
              })
            ).map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td
                  className={css({
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                  })}
                >
                  {row.dataType}
                </td>
                <td
                  className={css({
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                  })}
                >
                  {row.retention}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <P>{t('terms.articles.article7.sections.section5.additionalInfo')}</P>

        {/* Section 7.6 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section6.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section6.content')}</P>

        {/* Section 7.7 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section7.title')}
        </H>
        <P>{t('terms.articles.article7.sections.section7.content')}</P>
        <Ul
          style={{
            marginBottom: '1rem',
          }}
        >
          {ensureArray(
            t('terms.articles.article7.sections.section7.rights', {
              returnObjects: true,
            })
          ).map((right, index) => (
            <li key={index}>{right}</li>
          ))}
        </Ul>

        <P>
          {t(
            'terms.articles.article7.sections.section7.exerciseRights.content'
          )}
        </P>
        <Ul
          style={{
            marginBottom: '1rem',
          }}
        >
          {ensureArray(
            t(
              'terms.articles.article7.sections.section7.exerciseRights.methods',
              { returnObjects: true }
            )
          ).map((method, index) => {
            if (
              typeof method === 'string' &&
              method.includes('visio@numerique.gouv.fr')
            ) {
              const parts = method.split('visio@numerique.gouv.fr')
              return (
                <li key={index}>
                  {parts[0]}
                  <A href="mailto:visio@numerique.gouv.fr" color="primary">
                    visio@numerique.gouv.fr
                  </A>
                  {parts[1]}
                </li>
              )
            }
            return <li key={index}>{method}</li>
          })}
        </Ul>

        {ensureArray(
          t('terms.articles.article7.sections.section7.additionalInfo', {
            returnObjects: true,
          })
        ).map((info, index) => {
          if (typeof info === 'string' && info.includes('Cnil')) {
            const parts = info.split('Cnil')
            return (
              <P key={index}>
                {parts[0]}
                <A
                  href="https://www.cnil.fr/fr/modele/courrier/sopposer-au-traitement-de-donnees"
                  color="primary"
                >
                  Cnil
                </A>
                {parts[1]}
              </P>
            )
          }
          return <P key={index}>{info}</P>
        })}

        {/* Section 7.8 */}
        <H lvl={3} bold>
          {t('terms.articles.article7.sections.section8.title')}
        </H>
        {ensureArray(
          t('terms.articles.article7.sections.section8.paragraphs', {
            returnObjects: true,
          })
        ).map((paragraph, index) => (
          <P key={index}>{paragraph}</P>
        ))}
      </HStack>
    </Screen>
  )
}
