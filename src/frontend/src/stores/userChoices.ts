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
}

function getUserChoicesState(): LocalUserChoices {
  return loadUserChoices()
}

export const userChoicesStore = proxy<LocalUserChoices>(getUserChoicesState())

subscribe(userChoicesStore, () => {
  saveUserChoices(userChoicesStore, false)
})
