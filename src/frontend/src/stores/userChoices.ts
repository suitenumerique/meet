import { proxy, subscribe } from 'valtio'
import { ProcessorSerialized } from '@/features/rooms/livekit/components/blur'
import {
  loadUserChoices,
  saveUserChoices,
  LocalUserChoices as LocalUserChoicesLK,
} from '@livekit/components-core'

export type VideoResolution = 'h720' | 'h360' | 'h180'

export type LocalUserChoices = LocalUserChoicesLK & {
  processorSerialized?: ProcessorSerialized
  noiseReductionEnabled?: boolean
  audioOutputDeviceId?: string
  videoPublishResolution?: VideoResolution
}

function getUserChoicesState(): LocalUserChoices {
  return {
    noiseReductionEnabled: false,
    audioOutputDeviceId: 'default', // Use 'default' to match LiveKit's standard device selection behavior
    videoPublishResolution: 'h720',
    ...loadUserChoices(),
  }
}

export const userChoicesStore = proxy<LocalUserChoices>(getUserChoicesState())

subscribe(userChoicesStore, () => {
  saveUserChoices(userChoicesStore, false)
})
