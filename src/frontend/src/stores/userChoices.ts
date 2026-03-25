import { proxy, subscribe } from 'valtio'
import {
  ProcessorConfig,
  ProcessorType,
} from '@/features/rooms/livekit/components/blur'
import {
  loadUserChoices,
  LocalUserChoices as LocalUserChoicesLK,
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
