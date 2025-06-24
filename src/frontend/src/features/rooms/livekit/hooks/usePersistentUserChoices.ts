import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'
import { ProcessorSerialized } from '@/features/rooms/livekit/components/blur'

export function usePersistentUserChoices() {
  const userChoicesSnap = useSnapshot(userChoicesStore)

  return {
    userChoices: userChoicesSnap,
    saveAudioInputEnabled: (isEnabled: boolean) => {
      userChoicesStore.audioEnabled = isEnabled
    },
    saveVideoInputEnabled: (isEnabled: boolean) => {
      userChoicesStore.videoEnabled = isEnabled
    },
    saveAudioInputDeviceId: (deviceId: string) => {
      userChoicesStore.audioDeviceId = deviceId
    },
    saveVideoInputDeviceId: (deviceId: string) => {
      userChoicesStore.videoDeviceId = deviceId
    },
    saveUsername: (username: string) => {
      userChoicesStore.username = username
    },
    saveProcessorSerialized: (
      processorSerialized: ProcessorSerialized | undefined
    ) => {
      userChoicesStore.processorSerialized = processorSerialized
    },
  }
}
