import { useStartRecording, useStopRecording } from '@/features/recording'
import { recordingStore } from '@/stores/recording'

export const useMutateRecording = () => {
  const { mutateAsync: startRecording, isPending: isPendingToStart } =
    useStartRecording({
      onError: () => {
        recordingStore.isErrorDialogOpen = 'start'
      },
    })
  const { mutateAsync: stopRecording, isPending: isPendingToStop } =
    useStopRecording({
      onError: () => {
        recordingStore.isErrorDialogOpen = 'stop'
      },
    })

  return {
    startRecording,
    isPendingToStart,
    stopRecording,
    isPendingToStop,
  }
}
