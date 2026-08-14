import { useSnapshot } from 'valtio'
import { deviceInUseStore } from '@/stores/deviceInUse'
import { PERMISSION_BY_DEVICE_KIND } from '@/stores/permissions'
import { useCannotUseDevice } from './useCannotUseDevice'
import { useDeviceMissing } from './useDeviceMissing'

export const useDeviceInUse = (kind: MediaDeviceKind): boolean => {
  const inUse = useSnapshot(deviceInUseStore)
  const cannotUseDevice = useCannotUseDevice(kind)
  const deviceMissing = useDeviceMissing(kind)

  const permissionKind = PERMISSION_BY_DEVICE_KIND[kind]
  if (!permissionKind || cannotUseDevice || deviceMissing) return false
  return inUse[permissionKind]
}
