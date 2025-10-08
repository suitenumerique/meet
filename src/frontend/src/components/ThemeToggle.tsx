import { useState, useEffect } from 'react'
import { Button } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

const themeToggleStyles = css({
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  width: '50px',
  height: '50px',
  borderRadius: '50%',
  border: 'none',
  background: 'var(--theme-toggle-bg, #3498db)',
  color: 'var(--theme-toggle-color, white)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
  transition: 'all 0.3s ease',
  zIndex: 1000,
  '&:hover': {
    transform: 'scale(1.1)',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
  },
  '&:focus': {
    outline: '2px solid #fff',
    outlineOffset: '2px',
  },
})

type Theme = 'light' | 'dark' | 'auto'

export const ThemeToggle = () => {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme
    return saved || 'auto'
  })

  useEffect(() => {
    const applyTheme = (newTheme: Theme) => {
      const root = document.documentElement
      
      if (newTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        root.setAttribute('data-theme', newTheme)
      }
      
      // Update CSS custom properties for theme toggle
      if (newTheme === 'dark' || (newTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.style.setProperty('--theme-toggle-bg', '#2c3e50')
        root.style.setProperty('--theme-toggle-color', '#ecf0f1')
      } else {
        root.style.setProperty('--theme-toggle-bg', '#3498db')
        root.style.setProperty('--theme-toggle-color', 'white')
      }
    }

    applyTheme(theme)
    localStorage.setItem('theme', theme)

    // Listen for system theme changes when in auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme('auto')
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'auto']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return '☀️'
      case 'dark': return '🌙'
      case 'auto': return '🔄'
      default: return '🔄'
    }
  }

  const getThemeLabel = () => {
    switch (theme) {
      case 'light': return t('theme.light', 'Light theme')
      case 'dark': return t('theme.dark', 'Dark theme')
      case 'auto': return t('theme.auto', 'Auto theme')
      default: return t('theme.auto', 'Auto theme')
    }
  }

  return (
    <Button
      className={themeToggleStyles}
      onPress={cycleTheme}
      aria-label={`${t('theme.toggle', 'Toggle theme')} - ${getThemeLabel()}`}
      title={getThemeLabel()}
    >
      {getThemeIcon()}
    </Button>
  )
}