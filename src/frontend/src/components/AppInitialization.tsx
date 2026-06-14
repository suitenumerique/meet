import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSupport } from '@/features/support/hooks/useSupport'
import { useSyncUserPreferencesWithBackend } from '@/features/auth/api/useSyncUserPreferencesWithBackend'
import { useEffect } from 'react'

export const AppInitialization = () => {
  const { data } = useConfig()
  useSyncUserPreferencesWithBackend()

  const { analytics = {}, support = {}, custom_css_url = '' } = data ?? {}

  useAnalytics(analytics)
  useSupport(support)

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
