import { RecordingMode } from '../types'
import { FeatureFlags } from '@/features/analytics/enums'
import { useRecordingPermission } from './useRecordingPermission'

export const useHasRecordingAccess = (
  mode: RecordingMode,
  featureFlag: FeatureFlags
) => {
  const { isFeatureAvailable, hasPermission } = useRecordingPermission(
    mode,
    featureFlag
  )

  return isFeatureAvailable && hasPermission
}
