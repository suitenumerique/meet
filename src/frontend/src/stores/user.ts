import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'

type State = {
  username: string
}

const DEFAULT_STATE = {
  username: '',
}

function getUserState(): State {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored)
    return {
      ...parsed,
    }
  } catch (error: unknown) {
    console.error(
      '[UserPreferencesStore] Failed to parse stored settings:',
      error
    )
    return DEFAULT_STATE
  }
}

export const userStore = proxy<State>(getUserState())

subscribe(userStore, () => {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userStore))
})

export const saveUsername = (username: string) => {
  userStore.username = username
}
