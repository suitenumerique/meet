import { useSnapshot } from 'valtio'
import { userChoicesStore, VideoResolution } from '@/stores/userChoices'
import { ProcessorSerialized } from '@/features/rooms/livekit/components/blur'
import { VideoQuality } from 'livekit-client'

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
    saveVideoSubscribeQuality: (quality: VideoQuality) => {
      userChoicesStore.videoSubscribeQuality = quality
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
