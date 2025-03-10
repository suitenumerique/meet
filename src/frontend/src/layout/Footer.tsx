import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { A, Link } from '@/primitives'
import { useTranslation } from 'react-i18next'

const StyledLi = styled('li', {
  base: {},
  variants: {
    divider: {
      true: {
        _after: {
          content: '""',
          display: 'inline-block',
          marginX: '.75rem',
          verticalAlign: 'middle',
          boxShadow: 'inset 0 0 0 1px #ddd',
          height: '1rem',
          width: '1px',
        },
      },
    },
  },
})

const InnerContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    margin: 'auto',
    maxWidth: '1200px',
    paddingX: { base: '0.5rem', xs: '1rem', sm: '2rem' },
  },
})

const MainLinkList = styled('ul', {
  base: {
    display: 'flex',
    gap: '0.5rem 1rem',
    flexWrap: 'wrap',
    flexBasis: { base: '100%', md: '50%' },
  },
})

const FirstRow = styled('div', {
  base: {
    display: 'flex',
    gap: '2rem',
    flexWrap: { base: 'wrap', md: 'nowrap' },
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
  },
})

const SecondRow = styled('ul', {
  base: {
    display: 'flex',
    borderTop: '1px solid rgb(217 217 217)',
    paddingTop: '0.5rem',
    width: '100%',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})

const ThirdRow = styled('p', {
  base: {
    fontSize: '0.75rem',
    color: 'rgb(77 77 77)',
    fontFamily: 'Marianne',
    textWrap: 'wrap',
    lineHeight: '1rem',
    marginTop: { base: '1rem', xs: '0.5rem' },
  },
})

const Marianne = () => {
  return (
    <div
      className={css({
        _before: {
          content: '""',
          display: 'block',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          backgroundImage: 'url(/assets/marianne.svg)',
          height: '1.25rem',
          marginBottom: '.2rem',
          width: '3rem',
        },
        _after: {
          content: '""',
          display: 'block',
          backgroundImage: 'url(/assets/devise.svg)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          height: '2.313rem',
          marginTop: '.2rem',
          width: '3.25rem',
        },
      })}
    >
      <p
        className={css({
          letterSpacing: '-.01em',
          textTransform: 'uppercase',
          fontWeight: '600',
          fontFamily: 'Marianne',
          fontSize: '1.25rem',
          lineHeight: '1.75rem',
        })}
      >
        gouvernement
      </p>
    </div>
  )
}

export const Footer = () => {
  const { t } = useTranslation('global', { keyPrefix: 'footer' })

  return (
    <footer
      className={css({
        borderTop: '2px solid rgb(0 0 145)',
        paddingY: '2rem',
        marginTop: { base: '50px', sm: '100px' },
      })}
    >
      <InnerContainer>
        <FirstRow>
          <div
            className={css({
              display: 'flex',
              paddingBottom: '1.5rem',
              paddingX: '1.5rem',
              alignItems: 'center',
              gap: '1.5rem',
            })}
          >
            <Marianne />
            <span
              className={css({
                height: '80px',
                backgroundColor: 'rgb(77 77 77)',
                width: '1px',
                display: { base: 'none', sm: 'block' },
              })}
            />
            <p
              className={css({
                display: 'none',
                fontWeight: '700',
                fontFamily: 'Marianne',
                sm: {
                  display: 'block',
                  fontSize: '1rem',
                  lineHeight: '1.5rem',
                },
              })}
            >
              Direction
              <br />
              interministérielle
              <br />
              du numérique
            </p>
          </div>
          <MainLinkList>
            <li>
              <A
                externalIcon
                underline={false}
                footer="important"
                href="https://legifrance.gouv.fr"
                aria-label={
                  t('links.legifrance') + ' - ' + t('links.ariaLabel')
                }
              >
                {t('links.legifrance')}
              </A>
            </li>
            <li>
              <A
                externalIcon
                underline={false}
                footer="important"
                href="https://info.gouv.fr"
                aria-label={t('links.infogouv') + ' - ' + t('links.ariaLabel')}
              >
                {t('links.infogouv')}
              </A>
            </li>
            <li>
              <A
                externalIcon
                underline={false}
                footer="important"
                href="https://www.service-public.fr/"
                aria-label={
                  t('links.servicepublic') + ' - ' + t('links.ariaLabel')
                }
              >
                {t('links.servicepublic')}
              </A>
            </li>
            <li>
              <A
                externalIcon
                underline={false}
                footer="important"
                href="https://data.gouv.fr"
                aria-label={t('links.datagouv') + ' - ' + t('links.ariaLabel')}
              >
                {t('links.datagouv')}
              </A>
            </li>
          </MainLinkList>
        </FirstRow>
        <SecondRow>
          <StyledLi divider>
            <Link
              underline={false}
              footer="minor"
              to="/mentions-legales"
              aria-label={t('links.legalsTerms')}
            >
              {t('links.legalsTerms')}
            </Link>
          </StyledLi>
          <StyledLi divider>
            <A
              externalIcon
              underline={false}
              footer="minor"
              href="https://docs.numerique.gouv.fr/docs/168d7e8e-3f09-462d-8bbc-ea95dedd3889/"
              aria-label={t('links.data') + ' - ' + t('links.ariaLabel')}
            >
              {t('links.data')}
            </A>
          </StyledLi>
          <StyledLi divider>
            <Link
              underline={false}
              footer="minor"
              to="/accessibilite"
              aria-label={t('links.accessibility')}
            >
              {t('links.accessibility')}
            </Link>
          </StyledLi>
          <StyledLi divider>
            <A
              externalIcon
              underline={false}
              footer="minor"
              href="https://docs.numerique.gouv.fr/docs/f2baa1b9-f29e-4d58-959d-65d4376fc6b8/"
              aria-label={
                t('links.technicalDetails') + ' - ' + t('links.ariaLabel')
              }
            >
              {t('links.technicalDetails')}
            </A>
          </StyledLi>
          <StyledLi>
            <A
              externalIcon
              underline={false}
              footer="minor"
              href="https://github.com/numerique-gouv/meet/"
              aria-label={t('links.code') + ' - ' + t('links.ariaLabel')}
            >
              {t('links.code')}
            </A>
          </StyledLi>
        </SecondRow>
        <ThirdRow>
          {t('mentions')}{' '}
          <A
            externalIcon
            footer="minor"
            href="https://github.com/etalab/licence-ouverte/blob/master/LO.md"
          >
            {t('license')}
          </A>
        </ThirdRow>
      </InnerContainer>
    </footer>
  )
}
