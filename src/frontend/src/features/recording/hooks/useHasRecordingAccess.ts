import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { RecordingMode } from '../types'
import { useIsRecordingModeEnabled } from './useIsRecordingModeEnabled'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { FeatureFlags } from '@/features/analytics/enums'

export const useHasRecordingAccess = (
  mode: RecordingMode,
  featureFlag: FeatureFlags
) => {
  const featureEnabled = useFeatureFlagEnabled(featureFlag)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isRecordingModeEnabled = useIsRecordingModeEnabled(mode)
  const isAdminOrOwner = useIsAdminOrOwner()

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    isAdminOrOwner &&
    isRecordingModeEnabled
  )
}
