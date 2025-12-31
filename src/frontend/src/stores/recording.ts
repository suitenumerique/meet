import { proxy } from 'valtio'

export enum RecordingLanguage {
  ENGLISH = 'en',
  FRENCH = 'fr',
  AUTOMATIC = 'auto',
}

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
  language: RecordingLanguage
}

export const recordingStore = proxy<State>({
  status: RecordingStatus.STOPPED,
  language: RecordingLanguage.FRENCH,
})
