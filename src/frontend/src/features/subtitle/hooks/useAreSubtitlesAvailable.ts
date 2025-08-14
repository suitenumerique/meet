import { useFeatureFlagEnabled } from 'posthog-js/react'
import { FeatureFlags } from '@/features/analytics/enums'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { useConfig } from '@/api/useConfig'

export const useAreSubtitlesAvailable = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.subtitles)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const { data } = useConfig()

  return data?.subtitle.enabled && (!isAnalyticsEnabled || featureEnabled)
}
