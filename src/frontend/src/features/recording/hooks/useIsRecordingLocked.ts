import { useIsMutating } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { RecordingMode } from '../types'
import { useRecordingStatuses } from './useRecordingStatuses'

/**
 * True while a recording is being requested, starting, started or saving.
 * Recording settings must not change during that window, as they were (or
 * are about to be) sent to the backend for the current recording.
 */
export const useIsRecordingLocked = () => {
  const screenRecording = useRecordingStatuses(RecordingMode.ScreenRecording)
  const transcript = useRecordingStatuses(RecordingMode.Transcript)
  const pendingStarts = useIsMutating({ mutationKey: [keys.startRecording] })

  return pendingStarts > 0 || screenRecording.isActive || transcript.isActive
}
