import { proxy } from 'valtio'

export enum RecordingLanguage {
  ENGLISH = 'en',
  FRENCH = 'fr',
  AUTOMATIC = 'auto',
}

type State = {
  language: RecordingLanguage
}

export const recordingStore = proxy<State>({
  language: RecordingLanguage.FRENCH,
})
