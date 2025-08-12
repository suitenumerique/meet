import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'
import type { VideoResolution } from '@/stores/userChoices'
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
    saveAudioOutputDeviceId: (deviceId: string) => {
      userChoicesStore.audioOutputDeviceId = deviceId
    },
    saveVideoInputDeviceId: (deviceId: string) => {
      userChoicesStore.videoDeviceId = deviceId
    },
    saveVideoPublishResolution: (resolution: VideoResolution) => {
      userChoicesStore.videoPublishResolution = resolution
    },
    saveUsername: (username: string) => {
      userChoicesStore.username = username
    },
    saveNoiseReductionEnabled: (enabled: boolean) => {
      userChoicesStore.noiseReductionEnabled = enabled
    },
    saveProcessorSerialized: (
      processorSerialized: ProcessorSerialized | undefined
    ) => {
      userChoicesStore.processorSerialized = processorSerialized
    },
  }
}
