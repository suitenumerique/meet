import { proxy, subscribe } from 'valtio'
import { ProcessorSerialized } from '@/features/rooms/livekit/components/blur'
import {
  loadUserChoices,
  saveUserChoices,
  LocalUserChoices as LocalUserChoicesLK,
} from '@livekit/components-core'

export type LocalUserChoices = LocalUserChoicesLK & {
  processorSerialized?: ProcessorSerialized
  noiseReductionEnabled?: boolean
  audioOutputDeviceId?: string
}

function getUserChoicesState(): LocalUserChoices {
  return {
    noiseReductionEnabled: false,
    audioOutputDeviceId: 'default',
    ...loadUserChoices(),
  }
}

export const userChoicesStore = proxy<LocalUserChoices>(getUserChoicesState())

subscribe(userChoicesStore, () => {
  saveUserChoices(userChoicesStore, false)
})
