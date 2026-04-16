import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { FeatureFlags } from '@/features/analytics/enums'

export const useIsMetadataCollectorEnabled = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.metadataCollector)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  return (featureEnabled && isAnalyticsEnabled) || true
}
