import { subscribeKey } from 'valtio/utils'

export function subscribeKeyWithPrev<T extends object, K extends keyof T>(
  state: T,
  key: K,
  cb: (value: T[K], prev: T[K]) => void
) {
  let prev = state[key]

  return subscribeKey(state, key, (value: T[K]) => {
    cb(value, prev)
    prev = value
  })
}
