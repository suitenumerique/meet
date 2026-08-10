import { useSnapshot } from 'valtio'
import { deviceAvailabilityStore } from '@/stores/deviceAvailability'
import { permissionsStore } from '@/stores/permissions'

/**
 * enumerateDevices() may hide OS/app-blocked devices on Firefox Android.
 * Only report "missing" when no permission block explains the absence,
 * so the permission UI takes precedence.
 */
export const useDeviceMissing = (kind: MediaDeviceKind): boolean => {
  const { hasCamera, hasMicrophone } = useSnapshot(deviceAvailabilityStore)
  const {
    cameraSystemDenied,
    microphoneSystemDenied,
    isCameraDenied,
    isMicrophoneDenied,
  } = useSnapshot(permissionsStore)

  switch (kind) {
    case 'videoinput':
      return !hasCamera && !cameraSystemDenied && !isCameraDenied
    case 'audioinput':
      return !hasMicrophone && !microphoneSystemDenied && !isMicrophoneDenied
    default:
      return false
  }
}
