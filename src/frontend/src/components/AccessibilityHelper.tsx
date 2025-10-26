import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

const skipLinkStyles = css({
  position: 'absolute',
  top: '-40px',
  left: '6px',
  background: '#000',
  color: '#fff',
  padding: '8px',
  textDecoration: 'none',
  borderRadius: '4px',
  zIndex: 1000,
  '&:focus': {
    top: '6px',
  },
})

const announcementStyles = css({
  position: 'absolute',
  left: '-10000px',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
})

export const AccessibilityHelper = () => {
  const { t } = useTranslation()
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    // Listen for route changes and announce them
    const handleRouteChange = () => {
      const title = document.title
      setAnnouncement(`${t('accessibility.navigatedTo', 'Navigated to')} ${title}`)
      
      // Clear announcement after screen reader has time to read it
      setTimeout(() => setAnnouncement(''), 1000)
    }

    // Listen for title changes (which happen on route changes)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.target === document.querySelector('title')) {
          handleRouteChange()
        }
      })
    })

    const titleElement = document.querySelector('title')
    if (titleElement) {
      observer.observe(titleElement, { childList: true })
    }

    return () => observer.disconnect()
  }, [t])

  return (
    <>
      {/* Skip to main content link */}
      <a 
        href="#main-content" 
        className={skipLinkStyles}
      >
        {t('accessibility.skipToMain', 'Skip to main content')}
      </a>
      
      {/* Screen reader announcements */}
      <div 
        className={announcementStyles}
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </>
  )
}