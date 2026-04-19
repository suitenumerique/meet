import { useFeatureFlagEnabled } from 'posthog-js/react'
import { FeatureFlags } from '@/features/analytics/enums.ts'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled.ts'
import { isMobileBrowser } from '@livekit/components-core'

export const useIsAdvancedConnectionObserverEnabled = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.candidatePolling)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const isMobile = isMobileBrowser()
  return !isMobile && isAnalyticsEnabled && featureEnabled
}
