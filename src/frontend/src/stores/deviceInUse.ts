import { proxy } from 'valtio'
import type { PermissionKind } from './permissions'

export const deviceInUseStore = proxy<Record<PermissionKind, boolean>>({
  camera: false,
  microphone: false,
})

const ALL_KINDS: PermissionKind[] = ['camera', 'microphone']

export const noteDeviceInUse = (kind?: PermissionKind) => {
  for (const k of kind ? [kind] : ALL_KINDS) {
    deviceInUseStore[k] = true
  }
}

export const clearDeviceInUse = (kind?: PermissionKind) => {
  for (const k of kind ? [kind] : ALL_KINDS) {
    deviceInUseStore[k] = false
  }
}
