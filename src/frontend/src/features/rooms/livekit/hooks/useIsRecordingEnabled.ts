import { RecordingMode } from '@/features/rooms/api/startRecording'
import { useConfig } from '@/api/useConfig'

export const useIsRecordingEnabled = (mode: RecordingMode) => {
  const { data } = useConfig()

  return (
    data?.recording?.is_enabled &&
    data?.recording?.available_modes?.includes(mode)
  )
}
