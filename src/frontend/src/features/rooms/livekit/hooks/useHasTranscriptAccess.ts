import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { RecordingMode } from '@/features/rooms/api/startRecording'
import { useIsAdminOrOwner } from './useIsAdminOrOwner'
import { useIsRecordingEnabled } from './useIsRecordingEnabled'

export const useHasTranscriptAccess = () => {
  const featureEnabled = useFeatureFlagEnabled('transcription-summary')
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const isTranscriptEnabled = useIsRecordingEnabled(RecordingMode.Transcript)
  const isAdminOrOwner = useIsAdminOrOwner()

  return (
    (featureEnabled || !isAnalyticsEnabled) &&
    isAdminOrOwner &&
    isTranscriptEnabled
  )
}
