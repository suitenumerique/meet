import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { RecordingMode } from '@/features/rooms/api/startRecording'
import { useIsRecordingEnabled } from './useIsRecordingEnabled'
import { useIsAdminOrOwner } from './useIsAdminOrOwner'

export const useHasScreenRecordingAccess = () => {
  const featureEnabled = useFeatureFlagEnabled('screen-recording')
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isScreenRecordingEnabled = useIsRecordingEnabled(
    RecordingMode.ScreenRecording
  )
  const isAdminOrOwner = useIsAdminOrOwner()

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    isAdminOrOwner &&
    isScreenRecordingEnabled
  )
}
