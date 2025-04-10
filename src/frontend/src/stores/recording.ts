import { proxy } from 'valtio'

export enum RecordingStatus {
  TRANSCRIPT_STARTING,
  TRANSCRIPT_STARTED,
  TRANSCRIPT_STOPPING,
  STOPPED,
  SCREEN_RECORDING_STARTING,
  SCREEN_RECORDING_STARTED,
  SCREEN_RECORDING_STOPPING,
  ANY_STARTED,
}

type State = {
  status: RecordingStatus
}

export const recordingStore = proxy<State>({
  status: RecordingStatus.STOPPED,
})
