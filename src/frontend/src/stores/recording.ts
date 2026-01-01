import { proxy } from 'valtio'

export enum RecordingLanguage {
  ENGLISH = 'en',
  FRENCH = 'fr',
  AUTOMATIC = 'auto',
}

type State = {
  language: RecordingLanguage
  isErrorDialogOpen: string
}

export const recordingStore = proxy<State>({
  language: RecordingLanguage.FRENCH,
  isErrorDialogOpen: '',
})
