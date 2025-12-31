import { RecordingMode } from '@/features/recording'
import { useRoomMetadata } from './useRoomMetadata'
import { useMemo } from 'react'

export interface RecordingStatuses {
  isStarting: boolean
  isStarted: boolean
  isSaving: boolean
  isActive: boolean
}

export const useRecordingStatuses = (
  mode: RecordingMode
): RecordingStatuses => {
  const metadata = useRoomMetadata()

  return useMemo(() => {
    if (metadata && metadata?.recording_mode === mode) {
      return {
        isStarting: metadata.recording_status === 'starting',
        isStarted: metadata.recording_status === 'started',
        isSaving: metadata.recording_status === 'saving',
        isActive: ['starting', 'started', 'saving'].includes(
          metadata.recording_status
        ),
      }
    }

    return {
      isStarting: false,
      isStarted: false,
      isSaving: false,
      isActive: false,
    }
  }, [mode, metadata])
}
