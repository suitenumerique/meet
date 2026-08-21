import { useSnapshot } from 'valtio'
import { deviceAvailabilityStore } from '@/stores/deviceAvailability'
import { useCannotUseDevice } from './useCannotUseDevice'
import { useDeviceMissing } from './useDeviceMissing'

export const useDeviceInUse = (kind: MediaDeviceKind): boolean => {
  const { cameraInUse, microphoneInUse } = useSnapshot(deviceAvailabilityStore)
  const cannotUseDevice = useCannotUseDevice(kind)
  const deviceMissing = useDeviceMissing(kind)

  if (cannotUseDevice || deviceMissing) return false

  switch (kind) {
    case 'videoinput':
      return cameraInUse
    case 'audioinput':
      return microphoneInUse
    default:
      return false
  }
}
