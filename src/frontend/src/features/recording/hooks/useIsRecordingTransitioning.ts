import { useSnapshot } from 'valtio'
import { RecordingStatus, recordingStore } from '@/stores/recording'

export const useIsRecordingTransitioning = () => {
  const recordingSnap = useSnapshot(recordingStore)

  const transitionalStates = [
    RecordingStatus.TRANSCRIPT_STARTING,
    RecordingStatus.TRANSCRIPT_STOPPING,
    RecordingStatus.SCREEN_RECORDING_STARTING,
    RecordingStatus.SCREEN_RECORDING_STOPPING,
  ]

  return transitionalStates.includes(recordingSnap.status)
}
