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
    if (!custom_css_url) return

    const link = document.createElement('link')
    link.href = custom_css_url
    link.id = 'meet-custom-css'
    link.rel = 'stylesheet'
    document.head.appendChild(link)

    return () => {
      if (link && link.parentNode) {
        link.remove()
      }
    }
  }, [custom_css_url])

  silenceLiveKitLogs(silence_livekit_debug_logs)

  return null
}
