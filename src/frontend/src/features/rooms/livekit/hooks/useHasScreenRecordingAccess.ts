import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { RecordingMode } from '@/features/rooms/api/startRecording'
import { useIsRecordingModeEnabled } from './useIsRecordingModeEnabled'
import { useIsAdminOrOwner } from './useIsAdminOrOwner'

export const useHasRecordingAccess = (
  mode: RecordingMode,
  featureFlag: string
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
