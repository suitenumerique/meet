import { silenceLiveKitLogs } from '@/utils/livekit'
import { useConfig } from '@/api/useConfig'
import { useAnalytics } from '@/features/analytics/hooks/useAnalytics'
import { useSupport } from '@/features/support/hooks/useSupport'
import { useLocation } from 'wouter'
import { useSyncUserPreferencesWithBackend } from '@/features/auth'

const SDK_BASE_ROUTE = '/sdk'

export const AppInitialization = () => {
  const { data } = useConfig()
  const [location] = useLocation()
  useSyncUserPreferencesWithBackend()

  const {
    analytics = {},
    support = {},
    silence_livekit_debug_logs = false,
  } = data || {}

  const isSDKContext = location.includes(SDK_BASE_ROUTE)

  useAnalytics({ ...analytics, isDisabled: isSDKContext })
  useSupport({ ...support, isDisabled: isSDKContext })

  silenceLiveKitLogs(silence_livekit_debug_logs)

  return null
}
