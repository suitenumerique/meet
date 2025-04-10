import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { FeatureFlags } from '@/features/analytics/enums'

export const useHasFaceLandmarksAccess = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.faceLandmarks)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  return featureEnabled || !isAnalyticsEnabled
}
