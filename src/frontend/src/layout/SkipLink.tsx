import { type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'

export const MAIN_CONTENT_ID = 'main-content'

// Visually hidden until focus (not sr-only). Must become visible on focus for keyboard users.
const StyledSkipLink = styled('a', {
  base: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
    textDecoration: 'none',
    _focusVisible: {
      position: 'fixed',
      top: '0.5rem',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'auto',
      height: 'auto',
      margin: 0,
      padding: '0.625rem 1rem',
      overflow: 'visible',
      clip: 'auto',
      whiteSpace: 'normal',
      zIndex: 9999,
      backgroundColor: 'white',
      color: 'primary.800',
      fontWeight: 500,
      fontSize: '0.875rem',
      border: '1px solid',
      borderColor: 'primary.800',
      borderRadius: 4,
      outline: '2px solid',
      outlineColor: 'focusRing',
      outlineOffset: 2,
    },
  },
})

export const SkipLink = () => {
  const { t } = useTranslation()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const main = document.getElementById(MAIN_CONTENT_ID)
    if (!main) return

    const heading = main.querySelector('h1, h2, h3') as HTMLElement | null
    const target = heading ?? main

    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1')
    }
    target.focus()
  }

  return (
    <StyledSkipLink href={`#${MAIN_CONTENT_ID}`} onClick={handleClick}>
      {t('skipLink')}
    </StyledSkipLink>
  )
}
