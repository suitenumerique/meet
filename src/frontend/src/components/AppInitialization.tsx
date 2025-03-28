import { silenceLiveKitLogs } from '@/utils/livekit'
import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSupport } from '@/features/support/hooks/useSupport'
import { useLocation } from 'wouter'

export const AppInitialization = () => {
  const { data } = useConfig()
  const [location] = useLocation()

  const {
    analytics = {},
    support = {},
    silence_livekit_debug_logs = false,
  } = data || {}

  const isSDK = location.includes('sdk')

  if (!isSDK) {
    useAnalytics(analytics)
    useSupport(support)
  }

  silenceLiveKitLogs(silence_livekit_debug_logs)

  return null
}
