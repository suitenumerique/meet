import { useSnapshot } from 'valtio'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { RecordingMode } from '@/features/recording'

export const useIsRecordingActive = (mode: RecordingMode) => {
  const recordingSnap = useSnapshot(recordingStore)

  switch (mode) {
    case RecordingMode.Transcript:
      return [
        RecordingStatus.TRANSCRIPT_STARTED,
        RecordingStatus.TRANSCRIPT_STARTING,
        RecordingStatus.TRANSCRIPT_STOPPING,
      ].includes(recordingSnap.status)
    case RecordingMode.ScreenRecording:
      return [
        RecordingStatus.SCREEN_RECORDING_STARTED,
        RecordingStatus.SCREEN_RECORDING_STARTING,
        RecordingStatus.SCREEN_RECORDING_STOPPING,
      ].includes(recordingSnap.status)
  }
}
