import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { RecordingMode, RecordingPermission } from '../types'
import { useIsRecordingModeEnabled } from './useIsRecordingModeEnabled'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { FeatureFlags } from '@/features/analytics/enums'
import { useConfig } from '@/api/useConfig'
import { useUser } from '@/features/auth'

export const useHasRecordingAccess = (
  mode: RecordingMode,
  featureFlag: FeatureFlags
) => {
  const featureEnabled = useFeatureFlagEnabled(featureFlag)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isRecordingModeEnabled = useIsRecordingModeEnabled(mode)
  const isAdminOrOwner = useIsAdminOrOwner()
  const { data: config } = useConfig()
  const { isLoggedIn } = useUser()

  // Get permission level for the mode
  const permissionLevel =
    mode === RecordingMode.ScreenRecording
      ? config?.recording?.screen_recording_permission
      : config?.recording?.transcript_permission

  // Check if user has required permission level
  const hasPermission =
    permissionLevel === RecordingPermission.Authenticated
      ? isLoggedIn
      : isAdminOrOwner

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    hasPermission &&
    isRecordingModeEnabled
  )
}
