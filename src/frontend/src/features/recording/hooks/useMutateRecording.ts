import { useStartRecording, useStopRecording } from '@/features/recording'
import { recordingStore } from '@/stores/recording'
import { captureEvent } from '@/features/analytics/telemetry'

export const useMutateRecording = () => {
  const { mutateAsync: startRecording, isPending: isPendingToStart } =
    useStartRecording({
      onError: () => {
        recordingStore.isErrorDialogOpen = 'start'
        captureEvent('error-starting-recording')
      },
    })
  const { mutateAsync: stopRecording, isPending: isPendingToStop } =
    useStopRecording({
      onError: () => {
        recordingStore.isErrorDialogOpen = 'stop'
        captureEvent('error-stopping-recording')
      },
    })

  return {
    startRecording,
    isPendingToStart,
    stopRecording,
    isPendingToStop,
  }
}
