import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'

export const useHasFaceLandmarksAccess = () => {
  const featureEnabled = useFeatureFlagEnabled('face-landmarks')
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  return featureEnabled || !isAnalyticsEnabled
} 