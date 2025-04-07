import { useSnapshot } from 'valtio'
import { RecordingStatus, recordingStore } from '@/stores/recording'

export const useIsScreenRecordingStarted = () => {
  const recordingSnap = useSnapshot(recordingStore)
  return recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTED
}

export const useIsTranscriptStarted = () => {
  const recordingSnap = useSnapshot(recordingStore)
  return recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTED
}
