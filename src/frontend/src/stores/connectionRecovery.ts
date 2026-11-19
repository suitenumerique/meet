import { proxy } from 'valtio'

export const connectionRecoveryStore = proxy({
  isRecovering: false,
})
