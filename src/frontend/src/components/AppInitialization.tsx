import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSyncUserPreferencesWithBackend } from '@/features/auth/api/useSyncUserPreferencesWithBackend'
import { useEffect } from 'react'

export const AppInitialization = () => {
  const { data } = useConfig()
  useSyncUserPreferencesWithBackend()

  const { analytics = {}, custom_css_url = '' } = data ?? {}

  useAnalytics(analytics)

  useEffect(() => {
    if (custom_css_url) {
      const link = document.createElement('link')
      link.href = custom_css_url
      link.id = 'meet-custom-css'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
  }, [custom_css_url])

  return null
}
