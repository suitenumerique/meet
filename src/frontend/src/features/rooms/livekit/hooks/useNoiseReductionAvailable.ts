import { useIsMobile } from '@/utils/useIsMobile'
import { useFeatureFlagEnabled } from 'posthog-js/react'
import { FeatureFlags } from '@/features/analytics/enums'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'

export const useNoiseReductionAvailable = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.faceLandmarks)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const isMobile = useIsMobile()

  return !isMobile && (!isAnalyticsEnabled || featureEnabled)
}
