import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import type { RecordingMode } from '../types'
import { useIsRecordingModeEnabled } from './useIsRecordingModeEnabled'
import { useCanRecord } from './useCanRecord'
import type { FeatureFlags } from '@/features/analytics/enums'

export const useHasFeatureWithoutRecordingRights = (
  mode: RecordingMode,
  featureFlag: FeatureFlags
) => {
  const featureEnabled = useFeatureFlagEnabled(featureFlag)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isRecordingModeEnabled = useIsRecordingModeEnabled(mode)
  const canRecord = useCanRecord()

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    isRecordingModeEnabled &&
    !canRecord
  )
}
