import { RecordingMode } from '../types'
import { useConfig } from '@/api/useConfig'

export const useIsRecordingModeEnabled = (mode: RecordingMode) => {
  const { data } = useConfig()

  return (
    data?.recording?.is_enabled &&
    data?.recording?.available_modes?.includes(mode)
  )
}
