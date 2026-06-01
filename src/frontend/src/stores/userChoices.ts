import { proxy, subscribe } from 'valtio'
import {
  ProcessorConfig,
  ProcessorType,
  SegmentationModel,
} from '@/features/rooms/livekit/components/blur'
import {
  loadUserChoices,
  type LocalUserChoices as LocalUserChoicesLK,
  saveUserChoices,
} from '@livekit/components-core'
import { VideoQuality } from 'livekit-client'

export type VideoResolution = 'h720' | 'h360' | 'h180'

export type LocalUserChoices = LocalUserChoicesLK & {
  processorConfig?: ProcessorConfig
  noiseReductionEnabled?: boolean
  audioOutputDeviceId?: string
  videoPublishResolution?: VideoResolution
  videoSubscribeQuality?: VideoQuality
}

function getUserChoicesState(): LocalUserChoices {
  return {
    noiseReductionEnabled: false,
    audioOutputDeviceId: 'default', // Use 'default' to match LiveKit's standard device selection behavior
    videoPublishResolution: 'h720',
    videoSubscribeQuality: VideoQuality.HIGH,
    ...loadUserChoices(),
  }
}

export const userChoicesStore = proxy<LocalUserChoices>(getUserChoicesState())
subscribe(userChoicesStore, () => {
  saveUserChoices(userChoicesStore, false)
})

// Default to SegmentationModel.AUTO if model is not set or is an unknown value in localStorage.
const cfg = userChoicesStore.processorConfig
if (
  cfg &&
  (cfg.type === ProcessorType.BLUR || cfg.type === ProcessorType.VIRTUAL)
) {
  if (
    cfg.model === undefined ||
    !Object.values(SegmentationModel).includes(cfg.model)
  ) {
    cfg.model = SegmentationModel.AUTO
  }
}

// we run some logic on store loading to check if the processor config is still valid
if (userChoicesStore.processorConfig?.type === ProcessorType.VIRTUAL) {
  if (userChoicesStore.processorConfig.imagePath.startsWith('blob:')) {
    // this happens when a not authenticated user had changed their background image
    // we restore clear the processor config to avoid displaying a black screen.
    userChoicesStore.processorConfig = undefined
  } else if (userChoicesStore.processorConfig.fileId) {
    // Checking if the image is still available / accessible
    await fetch(userChoicesStore.processorConfig.imagePath, {
      // We bypass the cache to ensure we have access
      cache: 'reload',
    })
      .then((response) => {
        // if we cannot fetch the image (likely a 401 from the backend because
        // the user is not logged in anymore, etc.),
        // we clear the processor config to avoid displaying a black screen.
        // This can happen when the user logs out for instance, etc.
        if (!response.ok) {
          userChoicesStore.processorConfig = undefined
        }
      })
      .catch(() => {
        userChoicesStore.processorConfig = undefined
      })
  }
}

export const saveAudioInputEnabled = (isEnabled: boolean) => {
  userChoicesStore.audioEnabled = isEnabled
}

export const saveVideoInputEnabled = (isEnabled: boolean) => {
  userChoicesStore.videoEnabled = isEnabled
}

export const saveAudioInputDeviceId = (deviceId: string) => {
  userChoicesStore.audioDeviceId = deviceId
}

export const saveAudioOutputDeviceId = (deviceId: string) => {
  userChoicesStore.audioOutputDeviceId = deviceId
}

export const saveVideoInputDeviceId = (deviceId: string) => {
  userChoicesStore.videoDeviceId = deviceId
}

export const saveVideoPublishResolution = (resolution: VideoResolution) => {
  userChoicesStore.videoPublishResolution = resolution
}

export const saveVideoSubscribeQuality = (quality: VideoQuality) => {
  userChoicesStore.videoSubscribeQuality = quality
}

export const saveUsername = (username: string) => {
  userChoicesStore.username = username
}

export const saveNoiseReductionEnabled = (enabled: boolean) => {
  userChoicesStore.noiseReductionEnabled = enabled
}

export const saveProcessorConfig = (
  processorConfig: ProcessorConfig | undefined
) => {
  userChoicesStore.processorConfig = processorConfig
}
