import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import type { RecordingMode } from '../types'
import { useIsRecordingModeEnabled } from './useIsRecordingModeEnabled'
import type { FeatureFlags } from '@/features/analytics/enums'
import { useCanRecord } from './useCanRecord'

export const useHasRecordingAccess = (
  mode: RecordingMode,
  featureFlag: FeatureFlags
) => {
  const featureEnabled = useFeatureFlagEnabled(featureFlag)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isRecordingModeEnabled = useIsRecordingModeEnabled(mode)
  const canRecord = useCanRecord()

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    canRecord &&
    isRecordingModeEnabled
  )
}
