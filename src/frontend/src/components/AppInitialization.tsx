import { silenceLiveKitLogs } from '@/utils/livekit'
import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSupport } from '@/features/support/hooks/useSupport'
import { useSyncUserPreferencesWithBackend } from '@/features/auth'
import { useEffect } from 'react'

export const AppInitialization = () => {
  const { data } = useConfig()
  useSyncUserPreferencesWithBackend()

  const {
    analytics = {},
    support = {},
    silence_livekit_debug_logs = false,
    custom_css_url = '',
  } = data ?? {}

  useAnalytics(analytics)
  useSupport(support)

  useEffect(() => {
    if (custom_css_url) {
      try {
        const customCssUrl = new URL(custom_css_url, window.location.origin)
        const trustedOrigins = [window.location.origin]

        if (
          customCssUrl.protocol === 'https:' &&
          trustedOrigins.includes(customCssUrl.origin)
        ) {
          const link = document.createElement('link')
          link.href = customCssUrl.toString()
          link.id = 'meet-custom-css'
          link.rel = 'stylesheet'
          document.head.appendChild(link)
        }
      } catch {
      }
    }
  }, [custom_css_url])

  silenceLiveKitLogs(silence_livekit_debug_logs)

  return null
}
