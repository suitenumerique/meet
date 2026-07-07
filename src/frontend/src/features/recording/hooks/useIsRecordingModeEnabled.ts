import type { RecordingMode } from '../types'
import { useConfig, type ApiConfig } from '@/api/useConfig'

/** Pure predicate: is `mode` available in the deployment recording config? */
export const isRecordingModeEnabled = (
  config: ApiConfig | undefined,
  mode: RecordingMode
): boolean =>
  !!(
    config?.recording?.is_enabled &&
    config?.recording?.available_modes?.includes(mode)
  )

export const useIsRecordingModeEnabled = (mode: RecordingMode): boolean => {
  const { data } = useConfig()
  return isRecordingModeEnabled(data, mode)
}
