import { useFeatureFlagEnabled } from '@/features/analytics/hooks/useFeatureFlagEnabled'
import { FeatureFlags } from '@/features/analytics/enums'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { isMobileBrowser } from '@livekit/components-core'

export const useNoiseReductionAvailable = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.noiseReduction)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const isMobile = isMobileBrowser()
  return !isMobile && (!isAnalyticsEnabled || featureEnabled)
}
