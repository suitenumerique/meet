import { proxy } from 'valtio'

export type ModalsState = {
  permissions: boolean
}

export const modalsStore = proxy<ModalsState>({
  permissions: false,
})
