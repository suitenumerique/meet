import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { reportError } from '@/features/analytics/telemetry'

export type RecordingEncodingPreference = {
  resolution?: string
  profile?: string
}

/**
 * Recording encoding preferences, shared by everyone using this browser.
 */
type State = RecordingEncodingPreference

const DEFAULT_STATE: State = {}

function getRecordingEncodingState(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECORDING_ENCODING)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored)
    if (!parsed) return DEFAULT_STATE
    return {
      ...DEFAULT_STATE,
      ...parsed,
    }
  } catch (error: unknown) {
    reportError('generic_failure', error, {
      context: '[RecordingEncodingStore] Failed to parse stored settings:',
    })
    return DEFAULT_STATE
  }
}

export const recordingEncodingStore = proxy<State>(getRecordingEncodingState())

subscribe(recordingEncodingStore, () => {
  localStorage.setItem(
    STORAGE_KEYS.RECORDING_ENCODING,
    JSON.stringify(recordingEncodingStore)
  )
})

export const setRecordingEncodingPreference = (
  preference: RecordingEncodingPreference
) => {
  Object.assign(recordingEncodingStore, preference)
}
