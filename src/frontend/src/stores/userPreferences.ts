import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { reportError } from '@/features/analytics/telemetry'

type State = {
  is_idle_disconnect_modal_enabled: boolean
  is_auto_mute_large_room_enabled: boolean
  is_participant_audio_leveling_enabled: boolean
}

const DEFAULT_STATE = {
  is_idle_disconnect_modal_enabled: true,
  is_auto_mute_large_room_enabled: true,
  is_participant_audio_leveling_enabled: false,
}

function getUserPreferencesState(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PREFERENCES)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored)
    return {
      ...DEFAULT_STATE,
      ...parsed,
    }
  } catch (error: unknown) {
    reportError('generic_failure', error, {
      context: '[UserPreferencesStore] Failed to parse stored settings:',
    })
    return DEFAULT_STATE
  }
}

export const userPreferencesStore = proxy<State>(getUserPreferencesState())

subscribe(userPreferencesStore, () => {
  localStorage.setItem(
    STORAGE_KEYS.USER_PREFERENCES,
    JSON.stringify(userPreferencesStore)
  )
})
