import { proxy } from 'valtio'

export enum TranscriptionStatus {
  STARTING,
  STARTED,
  STOPPING,
  STOPPED,
}

type State = {
  status: TranscriptionStatus
}

export const transcriptionStore = proxy<State>({
  status: TranscriptionStatus.STOPPED,
})
